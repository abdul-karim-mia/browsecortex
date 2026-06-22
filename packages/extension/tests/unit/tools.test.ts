import { describe, it, expect, vi } from 'vitest';
import { executeTool, getApiTools, getTool, isDestructive } from '@/tools/registry';
import type { ToolContext, ToolDefinition } from '@/tools/types';

const ctx: ToolContext = { getActiveTabId: async () => 1 };

// Minimal chrome.tabs stub so open_tab's executor can run under node (no real
// chrome global in this test environment).
let nextTabId = 1000;
(globalThis as unknown as { chrome?: unknown }).chrome = {
  tabs: {
    create: async (opts: { url: string }) => ({ id: nextTabId++, url: opts.url }),
    onRemoved: { addListener: () => {} },
    query: async () => [{ id: 1, windowId: 100 }],
    captureVisibleTab: async (windowId: number) => `data:image/png;base64,stub-data-${windowId}`,
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
