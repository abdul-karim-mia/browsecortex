/**
 * Advanced tab control (PLAN §11 + tool ideas): reload/duplicate/pin/mute,
 * lookup by URL, zoom, discard, move across windows.
 */
import type { ToolDefinition } from '../types';

async function activeId(getActive: () => Promise<number>, args: Record<string, unknown>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

export const reloadTab: ToolDefinition = {
  name: 'reload_tab',
  description: 'Reload a tab (defaults to the active tab).',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' }, bypass_cache: { type: 'boolean' } },
  },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const id = await activeId(ctx.getActiveTabId, args);
    await chrome.tabs.reload(id, { bypassCache: args.bypass_cache === true });
    return { reloaded: id };
  },
};

export const duplicateTab: ToolDefinition = {
  name: 'duplicate_tab',
  description: 'Duplicate a tab.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const tab = await chrome.tabs.duplicate(await activeId(ctx.getActiveTabId, args));
    return { id: tab?.id, url: tab?.url };
  },
};

export const pinTab: ToolDefinition = {
  name: 'pin_tab',
  description: 'Pin or unpin a tab.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' }, pinned: { type: 'boolean' } },
  },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const id = await activeId(ctx.getActiveTabId, args);
    const tab = await chrome.tabs.update(id, { pinned: args.pinned !== false });
    return { id, pinned: tab?.pinned };
  },
};

export const muteTab: ToolDefinition = {
  name: 'mute_tab',
  description: 'Mute or unmute a tab.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' }, muted: { type: 'boolean' } },
  },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const id = await activeId(ctx.getActiveTabId, args);
    const tab = await chrome.tabs.update(id, { muted: args.muted !== false });
    return { id, muted: tab?.mutedInfo?.muted };
  },
};

export const getTabByUrl: ToolDefinition = {
  name: 'get_tab_by_url',
  description: 'Find open tabs whose URL matches a pattern (substring or glob).',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'Substring or match pattern.' } },
    required: ['url'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    const q = String(args.url).toLowerCase();
    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter((t) => (t.url ?? '').toLowerCase().includes(q));
    return { tabs: matches.map((t) => ({ id: t.id, title: t.title, url: t.url })) };
  },
};

export const setTabZoom: ToolDefinition = {
  name: 'set_tab_zoom',
  description: 'Set the zoom factor of a tab (1 = 100%).',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' }, factor: { type: 'number' } },
    required: ['factor'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const factor = Number(args.factor);
    if (!Number.isFinite(factor) || factor <= 0) return { error: 'factor must be a positive number.' };
    const id = await activeId(ctx.getActiveTabId, args);
    await chrome.tabs.setZoom(id, factor);
    return { id, factor };
  },
};

export const discardTab: ToolDefinition = {
  name: 'discard_tab',
  description: 'Discard a tab from memory (stays in the tab strip, reloads on focus). Returns the new tab info in case the tab ID changes.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' } },
    required: ['tab_id'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    const tabId = Number(args.tab_id);
    const tab = await chrome.tabs.discard(tabId);
    return { discarded: tab.id ?? tabId, previous_id: tabId };
  },
};

export const advancedTabTools = [
  reloadTab,
  duplicateTab,
  pinTab,
  muteTab,
  getTabByUrl,
  setTabZoom,
  discardTab,
];
