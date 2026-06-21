/**
 * Window and cookie tools (PLAN §11). Cookie tools require the optional
 * `cookies` permission (PLAN §27).
 */
import type { ToolDefinition } from '../types';

export const getAllWindows: ToolDefinition = {
  name: 'get_all_windows',
  description: 'List all open browser windows and their tab counts.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'tab',
  async execute() {
    const windows = await chrome.windows.getAll({ populate: true });
    return {
      windows: windows.map((w) => ({
        id: w.id,
        focused: w.focused,
        state: w.state,
        tabCount: w.tabs?.length ?? 0,
      })),
    };
  },
};

export const createWindow: ToolDefinition = {
  name: 'create_window',
  description: 'Open a new browser window, optionally at a URL and incognito.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      incognito: { type: 'boolean' },
    },
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    const w = await chrome.windows.create({
      url: args.url ? String(args.url) : undefined,
      incognito: args.incognito === true,
    });
    return { id: w?.id };
  },
};

export const closeWindow: ToolDefinition = {
  name: 'close_window',
  description: 'Close a browser window by id.',
  parameters: {
    type: 'object',
    properties: { window_id: { type: 'number' } },
    required: ['window_id'],
  },
  destructive: true,
  timeout: 'tab',
  async execute(args) {
    await chrome.windows.remove(Number(args.window_id));
    return { closed: Number(args.window_id) };
  },
};

export const getCookies: ToolDefinition = {
  name: 'get_cookies',
  description: 'Get cookies for a URL (requires cookie permission). Treated as untrusted.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' } },
    required: ['url'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'history',
  async execute(args) {
    const has = await chrome.permissions.contains({ permissions: ['cookies'] }).catch(() => false);
    if (!has) return { error: 'Cookie permission not granted.' };
    const cookies = await chrome.cookies.getAll({ url: String(args.url) });
    return { cookies: cookies.map((c) => ({ name: c.name, value: c.value, domain: c.domain })) };
  },
};

export const deleteCookie: ToolDefinition = {
  name: 'delete_cookie',
  description: 'Delete a named cookie for a URL (requires cookie permission).',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' }, name: { type: 'string' } },
    required: ['url', 'name'],
  },
  destructive: true,
  timeout: 'history',
  async execute(args) {
    const has = await chrome.permissions.contains({ permissions: ['cookies'] }).catch(() => false);
    if (!has) return { error: 'Cookie permission not granted.' };
    await chrome.cookies.remove({ url: String(args.url), name: String(args.name) });
    return { deleted: String(args.name) };
  },
};

export const windowCookieTools = [
  getAllWindows,
  createWindow,
  closeWindow,
  getCookies,
  deleteCookie,
];
