import type { ToolDefinition } from '../types';

async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>): Promise<number> {
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

async function runDbgCommand<T>(tabId: number, method: string, params: Record<string, unknown>): Promise<T> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && isRestrictedUrl(tab.url)) {
    throw new Error('Chrome debugger cannot be attached to chrome:// URLs, extension system pages, or the Chrome Web Store.');
  }

  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
  } catch (e) {
    const err = e as { message?: string };
    if (err.message?.includes('Already attached')) {
      // Already attached, proceed to use it
    } else {
      throw e;
    }
  }

  try {
    const res = await chrome.debugger.sendCommand(target, method, params);
    return res as T;
  } finally {
    if (attached) {
      await chrome.debugger.detach(target).catch(() => {});
    }
  }
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

export const debuggerInteractionTools = [debuggerClick, debuggerType, debuggerKey];
