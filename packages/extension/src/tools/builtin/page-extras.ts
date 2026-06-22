/**
 * Page styling, media, storage, and environment tools (tool ideas).
 */
import type { ToolDefinition, ToolResult } from '../types';

async function tabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

async function runInPage<A extends unknown[]>(
  id: number,
  func: (...a: A) => unknown,
  args: A,
): Promise<ToolResult> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: id }, func, args });
    return (res?.result as ToolResult) ?? { error: 'No result.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── DOM / styling ─────────────────────────────────────────────────

export const injectCss: ToolDefinition = {
  name: 'inject_css',
  description: 'Inject custom CSS into the page (e.g. to hide a cookie banner).',
  parameters: {
    type: 'object',
    properties: { css: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['css'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: await tabId(args, ctx.getActiveTabId) },
        css: String(args.css),
      });
      return { injected: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const blockElement: ToolDefinition = {
  name: 'block_element',
  description: 'Hide elements matching a CSS selector (ads, overlays, popups).',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const els = document.querySelectorAll<HTMLElement>(selector);
        els.forEach((el) => (el.style.display = 'none'));
        return { hidden: els.length };
      },
      [String(args.selector)],
    );
  },
};

export const getComputedStyles: ToolDefinition = {
  name: 'get_computed_styles',
  description: 'Get key computed CSS properties of an element by CSS selector.',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return { error: 'Element not found.' };
        const s = getComputedStyle(el);
        const keys = ['display', 'color', 'backgroundColor', 'fontSize', 'position', 'visibility'];
        const styles: Record<string, string> = {};
        for (const k of keys)
          styles[k] = s.getPropertyValue(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()));
        return { styles };
      },
      [String(args.selector)],
    );
  },
};

export const getPageColorScheme: ToolDefinition = {
  name: 'get_page_color_scheme',
  description: 'Detect whether the page is rendering in dark or light mode.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      () => ({
        scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      }),
      [],
    );
  },
};

// ── Media ─────────────────────────────────────────────────────────

export const getVideoInfo: ToolDefinition = {
  name: 'get_video_info',
  description: 'Get info about the first <video> on the page (duration, time, paused, volume).',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      () => {
        const v = document.querySelector('video');
        if (!v) return { error: 'No video element found.' };
        return {
          duration: v.duration,
          currentTime: v.currentTime,
          paused: v.paused,
          volume: v.volume,
          muted: v.muted,
          playbackRate: v.playbackRate,
        };
      },
      [],
    );
  },
};

export const controlVideo: ToolDefinition = {
  name: 'control_video',
  description: 'Control the first <video>: play, pause, seek, set volume, or change speed.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['play', 'pause', 'seek', 'volume', 'speed'] },
      value: { type: 'number', description: 'Seconds (seek), 0-1 (volume), or rate (speed).' },
      tab_id: { type: 'number' },
    },
    required: ['action'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (action: string, value: number) => {
        const v = document.querySelector('video');
        if (!v) return { error: 'No video element found.' };
        if (action === 'play') void v.play();
        else if (action === 'pause') v.pause();
        else if (action === 'seek') v.currentTime = value;
        else if (action === 'volume') v.volume = Math.min(Math.max(value, 0), 1);
        else if (action === 'speed') v.playbackRate = value;
        return { ok: true, currentTime: v.currentTime };
      },
      [String(args.action), Number(args.value) || 0],
    );
  },
};

// ── Page storage ──────────────────────────────────────────────────

function storageTool(name: string, area: 'local' | 'session', write: boolean): ToolDefinition {
  return {
    name,
    description: write
      ? `Set a key in the page's ${area}Storage for the current origin.`
      : `Read ${area}Storage for the current origin (untrusted data).`,
    parameters: write
      ? {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
            tab_id: { type: 'number' },
          },
          required: ['key', 'value'],
        }
      : { type: 'object', properties: { key: { type: 'string' }, tab_id: { type: 'number' } } },
    destructive: write,
    readsExternal: !write,
    timeout: 'page_read',
    async execute(args, ctx) {
      return runInPage(
        await tabId(args, ctx.getActiveTabId),
        (areaName: string, doWrite: boolean, key: string | null, value: string) => {
          const store = areaName === 'session' ? sessionStorage : localStorage;
          if (doWrite) {
            store.setItem(key!, value);
            return { set: key };
          }
          if (key) return { value: store.getItem(key) };
          const all: Record<string, string> = {};
          for (let i = 0; i < Math.min(store.length, 100); i++) {
            const k = store.key(i)!;
            all[k] = (store.getItem(k) ?? '').slice(0, 500);
          }
          return { items: all };
        },
        [area, write, (args.key as string) ?? null, String(args.value ?? '')],
      );
    },
  };
}

export const getLocalStorage = storageTool('get_local_storage', 'local', false);
export const setLocalStorage = storageTool('set_local_storage', 'local', true);
export const getSessionStorage = storageTool('get_session_storage', 'session', false);
export const setSessionStorage = storageTool('set_session_storage', 'session', true);

// ── Environment ───────────────────────────────────────────────────

export const getBrowserInfo: ToolDefinition = {
  name: 'get_browser_info',
  description: 'Get browser/extension version and platform info.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'instant',
  async execute() {
    const platform = await chrome.runtime.getPlatformInfo();
    return {
      extensionVersion: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent,
      os: platform.os,
      arch: platform.arch,
      language: navigator.language,
      online: navigator.onLine,
    };
  },
};

export const getNetworkStatus: ToolDefinition = {
  name: 'get_network_status',
  description: 'Check online/offline status and connection type if available.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'instant',
  async execute() {
    const conn = (
      navigator as unknown as { connection?: { effectiveType?: string; downlink?: number } }
    ).connection;
    return {
      online: navigator.onLine,
      effectiveType: conn?.effectiveType ?? null,
      downlinkMbps: conn?.downlink ?? null,
    };
  },
};

export const pageExtraTools = [
  injectCss,
  blockElement,
  getComputedStyles,
  getPageColorScheme,
  getVideoInfo,
  controlVideo,
  getLocalStorage,
  setLocalStorage,
  getSessionStorage,
  setSessionStorage,
  getBrowserInfo,
  getNetworkStatus,
];
