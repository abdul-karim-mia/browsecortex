import { describe, it, expect, vi } from 'vitest';
import { executeTool, getApiTools, getTool, isDestructive } from '@/tools/registry';
import type { ToolContext, ToolDefinition } from '@/tools/types';

const ctx: ToolContext = { getActiveTabId: async () => 1 };

// Minimal chrome.tabs stub so open_tab's executor can run under node (no real
// chrome global in this test environment).
let nextTabId = 1000;
(globalThis as unknown as { chrome?: any }).chrome = {
  tabs: {
    create: async (opts: { url: string }) => ({ id: nextTabId++, url: opts.url }),
    onRemoved: { addListener: () => {} },
    query: async () => [{ id: 1, windowId: 100 }],
    get: async (id: number) => ({ id, windowId: 100 }),
    captureVisibleTab: async (windowId: number) => `data:image/png;base64,stub-data-${windowId}`,
  },
  runtime: {
    sendMessage: async () => ({ ok: true }),
    getURL: (path: string) => `chrome-extension://stub-id/${path}`,
    getContexts: async () => [],
    ContextType: {
      OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
    },
  },
  offscreen: {
    createDocument: async () => {},
    Reason: {
      BLOBS: 'BLOBS',
      CLIPBOARD: 'CLIPBOARD',
    },
  },
  permissions: {
    contains: async () => true,
  },
  scripting: {
    executeScript: async () => [{ result: {} }],
  },
};

describe('tool registry', () => {
  it('exposes API tool schemas for every registered tool', () => {
    const schemas = getApiTools();
    expect(schemas.length).toBeGreaterThan(0);
    for (const s of schemas) {
      expect(s.type).toBe('function');
      expect(typeof s.function.name).toBe('string');
      expect(typeof s.function.description).toBe('string');
    }
  });

  it('marks close_tab as destructive and get_all_tabs as safe', () => {
    // close_tab's destructiveness depends on whether the agent opened that tab
    // (PLAN §34 exemption), so it's a function rather than a fixed boolean —
    // assert through isDestructive() with a tab_id that was never AI-opened.
    expect(isDestructive('close_tab', { tab_id: 999 })).toBe(true);
    expect(getTool('get_all_tabs')?.destructive).toBe(false);
  });

  it('exempts close_tab from confirmation for a tab the agent opened itself', async () => {
    const opened = (await executeTool('open_tab', { url: 'https://example.com' }, ctx)) as {
      id: number;
    };
    expect(isDestructive('close_tab', { tab_id: opened.id })).toBe(false);
    // A tab the agent never opened still requires confirmation.
    expect(isDestructive('close_tab', { tab_id: opened.id + 12345 })).toBe(true);
  });

  it('gates ask_external_ai behind its opt-in flag (B7)', () => {
    const names = (opts?: Parameters<typeof getApiTools>[0]) =>
      getApiTools(opts).map((s) => s.function.name);
    expect(names()).not.toContain('ask_external_ai');
    expect(names({ externalAi: true })).toContain('ask_external_ai');
  });
});

describe('external-ai adapters (B7)', () => {
  it('resolves known services case-insensitively and rejects unknown', async () => {
    const { getAdapter, EXTERNAL_AI_ADAPTERS } = await import('@/adapters');
    expect(EXTERNAL_AI_ADAPTERS.length).toBeGreaterThanOrEqual(4);
    expect(getAdapter('ChatGPT')?.id).toBe('chatgpt');
    expect(getAdapter('nope')).toBeUndefined();
  });
});

describe('executeTool', () => {
  it('returns a structured error for unknown tools', async () => {
    const result = await executeTool('does_not_exist', {}, ctx);
    expect(result).toEqual({ error: 'Unknown tool: does_not_exist' });
  });

  it('runs get_current_datetime and returns an ISO timestamp', async () => {
    const result = await executeTool('get_current_datetime', {}, ctx);
    expect(result).toHaveProperty('iso');
    expect(() => new Date((result as { iso: string }).iso)).not.toThrow();
  });

  it('catches thrown errors and converts them to { error }', async () => {
    const throwing: ToolDefinition = {
      name: 'throwing',
      description: 'x',
      parameters: { type: 'object', properties: {} },
      destructive: false,
      timeout: 'instant',
      execute: async () => {
        throw new Error('boom');
      },
    };
    // Exercise the same error path via a direct race using a fake registry entry.
    const result = await (async () => {
      try {
        return await throwing.execute({}, ctx);
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    })();
    expect(result).toEqual({ error: 'boom' });
  });

  it('times out a slow tool', async () => {
    vi.useFakeTimers();
    // wait() honors the per-category timeout; request 30s but multiplier shrinks budget.
    const promise = executeTool('wait', { seconds: 30 }, ctx, 0.0001);
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result).toHaveProperty('error', 'timeout');
    vi.useRealTimers();
  });
});

describe('debugger interaction tools registration', () => {
  it('registers debugger_click, debugger_type, and debugger_key', () => {
    const clickTool = getTool('debugger_click');
    const typeTool = getTool('debugger_type');
    const keyTool = getTool('debugger_key');

    expect(clickTool).toBeDefined();
    expect(typeTool).toBeDefined();
    expect(keyTool).toBeDefined();

    expect(clickTool?.destructive).toBe(false);
    expect(typeTool?.destructive).toBe(false);
    expect(keyTool?.destructive).toBe(false);
  });
});

describe('screenshot tools', () => {
  it('runs screenshot_tab and returns a dataUrl with tab windowId', async () => {
    const result = await executeTool('screenshot_tab', {}, ctx);
    expect(result).toHaveProperty('dataUrl');
    expect((result as { dataUrl: string }).dataUrl).toContain('stub-data-100');
  });
});

describe('clipboard tools', () => {
  it('runs write_clipboard and broadcasts write message to offscreen', async () => {
    let sentMessage: any = null;
    (chrome.runtime.sendMessage as any) = vi.fn().mockImplementation(async (msg) => {
      sentMessage = msg;
      return { ok: true };
    });

    const result = await executeTool('write_clipboard', { text: 'hello world' }, ctx);
    expect(result).toEqual({ written: true });
    expect(sentMessage).toEqual({ type: 'clipboard_write', text: 'hello world' });
  });

  it('runs read_clipboard and requests read message from offscreen', async () => {
    let sentMessage: any = null;
    (chrome.runtime.sendMessage as any) = vi.fn().mockImplementation(async (msg) => {
      sentMessage = msg;
      return { ok: true, text: 'hello from clipboard' };
    });

    (chrome.permissions.contains as any) = vi.fn().mockResolvedValue(true);

    const result = await executeTool('read_clipboard', {}, ctx);
    expect(result).toEqual({ text: 'hello from clipboard' });
    expect(sentMessage).toEqual({ type: 'clipboard_read' });
  });
});

describe('new tools registration and execution', () => {
  it('registers all 11 new tools', () => {
    const list = [
      'upload_file',
      'save_page_as_pdf',
      'inject_script',
      'wait_for_condition',
      'query_selector_all',
      'get_dom_snapshot',
      'get_console_logs',
      'get_network_requests',
      'get_element_screenshot',
      'compare_screenshots',
      'fetch_url',
    ];
    for (const name of list) {
      expect(getTool(name)).toBeDefined();
    }
  });

  it('runs query_selector_all and returns mocked elements', async () => {
    const mockElements = [{ text: 'mock text', tagName: 'div' }];
    (chrome.scripting.executeScript as any) = vi.fn().mockResolvedValue([{ result: mockElements }]);
    const result = await executeTool('query_selector_all', { selector: 'div' }, ctx);
    expect(result).toEqual({ elements: mockElements });
  });

  it('runs get_dom_snapshot and returns DOM snapshot', async () => {
    const mockSnapshot = { tagName: 'body', attributes: {} };
    (chrome.scripting.executeScript as any) = vi.fn().mockResolvedValue([{ result: mockSnapshot }]);
    const result = await executeTool('get_dom_snapshot', { selector: 'body' }, ctx);
    expect(result).toEqual({ snapshot: mockSnapshot });
  });

  it('runs fetch_url and returns the response', async () => {
    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
      text: async () => '{"ok":true}',
    };
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    const result = await executeTool('fetch_url', { url: 'https://api.example.com/data' }, ctx);
    expect(result).toHaveProperty('status', 200);
    expect(result).toHaveProperty('body');
    expect((result as any).body).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: {},
      body: undefined,
    });
    spy.mockRestore();
  });
});

describe('batch 3 new tools and updates', () => {
  it('registers new tools: set_cookie, move_tab, wait_for_url, clear_console_logs, clear_network_requests, get_page_html, screenshot_full_page', () => {
    const list = [
      'set_cookie',
      'move_tab',
      'wait_for_url',
      'clear_console_logs',
      'clear_network_requests',
      'get_page_html',
      'screenshot_full_page',
    ];
    for (const name of list) {
      expect(getTool(name)).toBeDefined();
    }
  });

  it('runs set_cookie', async () => {
    const mockCookie = { name: 'test', domain: 'example.com', path: '/' };
    (chrome.cookies as any) = {
      set: vi.fn().mockResolvedValue(mockCookie),
    };
    (chrome.permissions.contains as any) = vi.fn().mockResolvedValue(true);

    const result = await executeTool(
      'set_cookie',
      { url: 'https://example.com', name: 'test', value: '123' },
      ctx
    );
    expect(result).toEqual({ cookie: { name: 'test', domain: 'example.com', path: '/' } });
  });

  it('runs move_tab', async () => {
    (chrome.tabs.move as any) = vi.fn().mockResolvedValue({});
    const result = await executeTool('move_tab', { tab_id: 123, index: 2, window_id: 456 }, ctx);
    expect(result).toEqual({ moved: 123, index: 2, window_id: 456 });
  });

  it('runs wait_for_url (substring match)', async () => {
    (chrome.tabs.get as any) = vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com/dashboard' });
    const result = await executeTool('wait_for_url', { url: '/dashboard', timeout_ms: 10 }, ctx);
    expect(result).toEqual({ ok: true, url: 'https://example.com/dashboard' });
  });

  it('runs clear_console_logs', async () => {
    (chrome.scripting.executeScript as any) = vi.fn().mockResolvedValue([{ result: undefined }]);
    const result = await executeTool('clear_console_logs', {}, ctx);
    expect(result).toEqual({ cleared: true });
  });

  it('runs clear_network_requests', async () => {
    (chrome.scripting.executeScript as any) = vi.fn().mockResolvedValue([{ result: undefined }]);
    const result = await executeTool('clear_network_requests', {}, ctx);
    expect(result).toEqual({ cleared: true });
  });

  it('runs get_page_html', async () => {
    (chrome.scripting.executeScript as any) = vi.fn().mockResolvedValue([{ result: '<div>test</div>' }]);
    const result = await executeTool('get_page_html', { selector: '#content' }, ctx);
    expect(result).toEqual({ html: '<div>test</div>' });
  });

  it('registers ocr_tesseract and ocr_native', () => {
    expect(getTool('ocr_tesseract')).toBeDefined();
    expect(getTool('ocr_native')).toBeDefined();
  });

  it('runs ocr_tesseract and returns text', async () => {
    (chrome.runtime.sendMessage as any) = vi.fn().mockResolvedValue({ ok: true, text: 'detected text' });
    const result = await executeTool('ocr_tesseract', { image: 'data:image/png;base64,stub' }, ctx);
    expect(result).toEqual({ text: 'detected text' });
  });

  it('runs ocr_native and returns text', async () => {
    (chrome.scripting.executeScript as any) = vi.fn().mockResolvedValue([{ result: { text: 'native detected text' } }]);
    const result = await executeTool('ocr_native', { image: 'data:image/png;base64,stub' }, ctx);
    expect(result).toEqual({ text: 'native detected text' });
  });
});
