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
    const wantIncognito = args.incognito === true;
    if (wantIncognito) {
      // chrome.windows.create silently fails (resolves with no window) when the
      // extension lacks incognito access, so check up front and explain why.
      const allowed = await new Promise<boolean>((resolve) =>
        chrome.extension.isAllowedIncognitoAccess((res) => resolve(res)),
      ).catch(() => false);
      if (!allowed) {
        return {
          error:
            'Cannot open an incognito window: this extension is not allowed in incognito. ' +
            'Enable "Allow in Incognito" for BrowseCortex in chrome://extensions.',
        };
      }
    }
    try {
      const w = await chrome.windows.create({
        url: args.url ? String(args.url) : undefined,
        incognito: wantIncognito,
      });
      if (!w?.id) return { error: 'Window could not be created.' };
      return { id: w.id, incognito: w.incognito === true };
    } catch (e) {
      return { error: `Failed to create window: ${e instanceof Error ? e.message : String(e)}` };
    }
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

export const setCookie: ToolDefinition = {
  name: 'set_cookie',
  description: 'Create or update a browser cookie for a given URL (requires cookie permission).',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The request-URI to associate with the cookie.' },
      name: { type: 'string', description: 'The name of the cookie.' },
      value: { type: 'string', description: 'The value of the cookie.' },
      domain: { type: 'string', description: 'The domain of the cookie.' },
      path: { type: 'string', description: 'The path of the cookie.' },
      secure: { type: 'boolean', description: 'Whether the cookie should be marked as Secure.' },
      httpOnly: { type: 'boolean', description: 'Whether the cookie should be marked as HttpOnly.' },
      sameSite: {
        type: 'string',
        enum: ['no_restriction', 'lax', 'strict'],
        description: 'The cookie SameSite state.',
      },
      expirationDate: { type: 'number', description: 'The expiration date of the cookie as Unix timestamp in seconds.' },
    },
    required: ['url', 'name', 'value'],
  },
  destructive: true,
  timeout: 'history',
  async execute(args) {
    const has = await chrome.permissions.contains({ permissions: ['cookies'] }).catch(() => false);
    if (!has) return { error: 'Cookie permission not granted.' };
    try {
      const details: chrome.cookies.SetDetails = {
        url: String(args.url),
        name: String(args.name),
        value: String(args.value),
        domain: args.domain !== undefined ? String(args.domain) : undefined,
        path: args.path !== undefined ? String(args.path) : undefined,
        secure: args.secure !== undefined ? Boolean(args.secure) : undefined,
        httpOnly: args.httpOnly !== undefined ? Boolean(args.httpOnly) : undefined,
        sameSite: args.sameSite as chrome.cookies.SameSiteStatus | undefined,
        expirationDate: args.expirationDate !== undefined ? Number(args.expirationDate) : undefined,
      };
      const cookie = await chrome.cookies.set(details);
      if (!cookie) return { error: 'Failed to set cookie.' };
      return { cookie: { name: cookie.name, domain: cookie.domain, path: cookie.path } };
    } catch (e) {
      return { error: `Failed to set cookie: ${e instanceof Error ? e.message : String(e)}` };
    }
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
  setCookie,
  deleteCookie,
];
