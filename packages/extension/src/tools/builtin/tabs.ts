/**
 * Tab management tools (PLAN §11). Native Chrome APIs in the service worker.
 */
import type { ToolDefinition } from '../types';

const MAX_TABS = 50;

// Tabs the agent opened itself (PLAN §34 exemption) — closing one of these
// doesn't need destructive confirmation, since the agent isn't taking away
// something the user had open. Lives only in memory: if the service worker
// restarts mid-conversation, these tabs just fall back to requiring
// confirmation like any other (safe default, not a correctness issue).
const aiOpenedTabIds = new Set<number>();
if (typeof chrome !== 'undefined' && chrome.tabs) {
  chrome.tabs.onRemoved.addListener((tabId) => aiOpenedTabIds.delete(tabId));
}

export function isAiOpenedTab(tabId: number): boolean {
  return aiOpenedTabIds.has(tabId);
}

export const getActiveTab: ToolDefinition = {
  name: 'get_active_tab',
  description: 'Get the currently active tab (id, title, URL).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'tab',
  async execute() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { error: 'No active tab found.' };
    return { id: tab.id, title: tab.title, url: tab.url };
  },
};

export const getAllTabs: ToolDefinition = {
  name: 'get_all_tabs',
  description: 'List all open tabs across all windows (id, title, URL).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'tab',
  async execute() {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs.slice(0, MAX_TABS).map((t) => ({ id: t.id, title: t.title, url: t.url })),
    };
  },
};

export const openTab: ToolDefinition = {
  name: 'open_tab',
  description: 'Open a new tab at the given URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to open.' },
      active: { type: 'boolean', description: 'Focus the new tab (default true).' },
    },
    required: ['url'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    const tab = await chrome.tabs.create({
      url: String(args.url),
      active: args.active !== false,
    });
    if (tab.id !== undefined) aiOpenedTabIds.add(tab.id);
    return { id: tab.id, url: tab.url };
  },
};

export const closeTab: ToolDefinition = {
  name: 'close_tab',
  description: 'Close a tab by its id.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number', description: 'The id of the tab to close.' } },
    required: ['tab_id'],
  },
  // Skip confirmation for tabs the agent opened itself this conversation.
  destructive: (args) => !isAiOpenedTab(Number(args.tab_id)),
  timeout: 'tab',
  async execute(args) {
    const id = Number(args.tab_id);
    if (!Number.isInteger(id)) return { error: 'tab_id must be an integer.' };
    await chrome.tabs.remove(id);
    return { closed: id };
  },
};

export const switchToTab: ToolDefinition = {
  name: 'switch_to_tab',
  description: 'Focus an existing tab by its id.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' } },
    required: ['tab_id'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    const id = Number(args.tab_id);
    const tab = await chrome.tabs.update(id, { active: true });
    if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    return { active: id };
  },
};

export const moveTab: ToolDefinition = {
  name: 'move_tab',
  description: 'Move a tab to a different index position or to another window.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number', description: 'The ID of the tab to move.' },
      index: { type: 'number', description: 'The 0-based position to move the tab to. Use -1 to place at the end.' },
      window_id: { type: 'number', description: 'Optional window ID to move the tab to.' },
    },
    required: ['tab_id'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    const tabIdVal = Number(args.tab_id);
    const index = args.index !== undefined ? Number(args.index) : -1;
    const windowId = args.window_id !== undefined ? Number(args.window_id) : undefined;
    try {
      await chrome.tabs.move(tabIdVal, { index, windowId });
      return { moved: tabIdVal, index, window_id: windowId };
    } catch (e) {
      return { error: `Failed to move tab: ${e instanceof Error ? e.message : String(e)}` };
    }
  },
};

export const tabTools = [getActiveTab, getAllTabs, openTab, closeTab, switchToTab, moveTab];
