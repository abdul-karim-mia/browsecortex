import type { ToolDefinition } from '../types';

export async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>): Promise<number> {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

function isRestrictedUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('https://chromewebstore.google.com/')
  );
}

export async function runDbgSession<T>(
  tabId: number,
  fn: (send: (method: string, params: Record<string, unknown>) => Promise<any>) => Promise<T>
): Promise<T> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && isRestrictedUrl(tab.url)) {
    throw new Error(
      'Chrome debugger cannot be attached to chrome:// URLs, extension system pages, or the Chrome Web Store.'
    );
  }

  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
  } catch (e) {
    const err = e as { message?: string };
    if (err.message?.includes('Already attached')) {
      // Already attached, proceed
    } else {
      throw e;
    }
  }

  try {
    const sendCommand = (method: string, params: Record<string, unknown>) =>
      chrome.debugger.sendCommand(target, method, params);
    return await fn(sendCommand);
  } finally {
    if (attached) {
      await chrome.debugger.detach(target).catch(() => {});
    }
  }
}

export async function runDbgCommand<T>(tabId: number, method: string, params: Record<string, unknown>): Promise<T> {
  return runDbgSession(tabId, (send) => send(method, params));
}

export const debuggerClick: ToolDefinition = {
  name: 'debugger_click',
  description:
    'Click at specific viewport coordinates (x, y) using trusted debugger events. ' +
    'Highly reliable for canvas, maps, custom widgets, or buttons that resist standard clicking.',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'Viewport X coordinate in pixels.' },
      y: { type: 'number', description: 'Viewport Y coordinate in pixels.' },
      button: {
        type: 'string',
        enum: ['left', 'right', 'middle'],
        default: 'left',
        description: 'Mouse button to click.',
      },
      click_count: {
        type: 'number',
        default: 1,
        description: 'Number of clicks (1 for single click, 2 for double click).',
      },
      tab_id: { type: 'number', description: 'Target tab ID.' },
    },
    required: ['x', 'y'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const x = Number(args.x);
    const y = Number(args.y);
    const button = (args.button as 'left' | 'right' | 'middle') || 'left';
    const clickCount = Number(args.click_count || 1);

    await runDbgCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });

    await runDbgCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount,
    });

    await runDbgCommand(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount,
    });

    return { clicked: true, x, y, button };
  },
};

export const debuggerType: ToolDefinition = {
  name: 'debugger_type',
  description:
    'Type text into the currently focused input or editor using trusted debugger events. ' +
    'Crucial for CodeMirror (GitHub editor), Monaco, and other rich SPA code editors that do not ' +
    'bind standard value property setters.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to type/insert.' },
      tab_id: { type: 'number', description: 'Target tab ID.' },
    },
    required: ['text'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const text = String(args.text);

    await runDbgCommand(tabId, 'Input.insertText', { text });

    return { typed: true, length: text.length };
  },
};

interface KeyCodeInfo {
  key: string;
  code: string;
  keyCode: number;
}

const KEY_MAP: Record<string, KeyCodeInfo> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Space: { key: ' ', code: 'Space', keyCode: 32 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
};

export const debuggerKey: ToolDefinition = {
  name: 'debugger_key',
  description:
    'Dispatch a special key press (like Enter, Backspace, Tab, Escape, arrow keys) ' +
    'with optional modifier keys (ctrl, alt, shift, meta) using trusted debugger events.',
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Key name (e.g. Enter, Backspace, Tab, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Space).',
      },
      modifiers: {
        type: 'array',
        items: { type: 'string', enum: ['alt', 'ctrl', 'meta', 'shift'] },
        description: 'Keyboard modifiers to hold.',
      },
      tab_id: { type: 'number', description: 'Target tab ID.' },
    },
    required: ['key'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const key = String(args.key);
    const modifiersList = (args.modifiers as string[]) || [];

    let modifiers = 0;
    if (modifiersList.includes('alt')) modifiers |= 1;
    if (modifiersList.includes('ctrl')) modifiers |= 2;
    if (modifiersList.includes('meta')) modifiers |= 4;
    if (modifiersList.includes('shift')) modifiers |= 8;

    const mapped = KEY_MAP[key] || { key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0) };

    await runDbgCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers,
      windowsVirtualKeyCode: mapped.keyCode,
      key: mapped.key,
      code: mapped.code,
    });

    await runDbgCommand(tabId, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers,
      windowsVirtualKeyCode: mapped.keyCode,
      key: mapped.key,
      code: mapped.code,
    });

    return { keySent: key, modifiers: modifiersList };
  },
};

export const uploadFile: ToolDefinition = {
  name: 'upload_file',
  description: 'Upload a file to an <input type="file"> element using the debugger.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the file input element.' },
      file_path: { type: 'string', description: 'Absolute local path to the file to upload.' },
      tab_id: { type: 'number', description: 'Target tab ID.' },
    },
    required: ['selector', 'file_path'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const selector = String(args.selector);
    const filePath = String(args.file_path);

    try {
      return await runDbgSession(tabId, async (send) => {
        await send('DOM.enable', {});
        const { root } = await send('DOM.getDocument', {});
        const { nodeId } = await send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector,
        });

        if (!nodeId) {
          throw new Error(`Element not found for selector: ${selector}`);
        }

        await send('DOM.setFileInputFiles', {
          nodeId,
          files: [filePath],
        });

        return { uploaded: true, selector, file_path: filePath };
      });
    } catch (e) {
      return { error: `Upload failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const savePageAsPdf: ToolDefinition = {
  name: 'save_page_as_pdf',
  description: 'Generate a PDF of the current page and return it as a Base64-encoded string.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number', description: 'Target tab ID.' },
    },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    try {
      const res = await runDbgCommand<{ data: string }>(tabId, 'Page.printToPDF', {
        transferMode: 'ReturnAsBase64',
      });
      return { pdfData: res.data, note: 'Base64 encoded PDF document.' };
    } catch (e) {
      return { error: `Failed to print to PDF: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const injectScript: ToolDefinition = {
  name: 'inject_script',
  description:
    'Inject a custom script into the page DOM (MAIN world) by creating and appending a <script> tag. ' +
    'Bypasses CSP unsafe-eval restrictions on most sites.',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to inject and execute.' },
      tab_id: { type: 'number', description: 'Target tab ID.' },
    },
    required: ['code'],
  },
  destructive: true,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const code = String(args.code);

    const injectTag = (scriptCode: string) => {
      try {
        const script = document.createElement('script');
        script.textContent = scriptCode;
        document.documentElement.appendChild(script);
        script.remove();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    };

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: injectTag,
        args: [code],
      });
      const data = res?.result as { ok: boolean; error?: string } | undefined;
      if (!data?.ok) return { error: data?.error ?? 'Script injection failed.' };
      return { injected: true };
    } catch (e) {
      return { error: `Injection failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const debuggerInteractionTools = [
  debuggerClick,
  debuggerType,
  debuggerKey,
  uploadFile,
  savePageAsPdf,
  injectScript,
];
