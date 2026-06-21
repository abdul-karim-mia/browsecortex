/**
 * Tab groups, sessions, reading list, and search (tool ideas). These use
 * Chrome APIs gated by their own permissions; each tool feature-detects and
 * returns a clean error when the API isn't available.
 */
import type { ToolDefinition } from '../types';

// ── Tab groups ────────────────────────────────────────────────────

export const groupTabs: ToolDefinition = {
  name: 'group_tabs',
  description: 'Group tabs together, optionally with a title and color.',
  parameters: {
    type: 'object',
    properties: {
      tab_ids: { type: 'array', items: { type: 'number' } },
      title: { type: 'string' },
      color: { type: 'string', description: 'grey|blue|red|yellow|green|pink|purple|cyan|orange' },
    },
    required: ['tab_ids'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    if (!chrome.tabGroups) return { error: 'Tab groups API unavailable.' };
    const tabIds = (args.tab_ids as number[]).map(Number);
    const groupId = await chrome.tabs.group({ tabIds });
    if (args.title || args.color) {
      await chrome.tabGroups.update(groupId, {
        title: args.title ? String(args.title) : undefined,
        color: args.color as chrome.tabGroups.ColorEnum | undefined,
      });
    }
    return { groupId };
  },
};

export const listTabGroups: ToolDefinition = {
  name: 'list_tab_groups',
  description: 'List all tab groups with their titles and colors.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'tab',
  async execute() {
    if (!chrome.tabGroups) return { error: 'Tab groups API unavailable.' };
    const groups = await chrome.tabGroups.query({});
    return { groups: groups.map((g) => ({ id: g.id, title: g.title, color: g.color })) };
  },
};

export const ungroupTabs: ToolDefinition = {
  name: 'ungroup_tabs',
  description: 'Remove tabs from their group.',
  parameters: {
    type: 'object',
    properties: { tab_ids: { type: 'array', items: { type: 'number' } } },
    required: ['tab_ids'],
  },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    await chrome.tabs.ungroup((args.tab_ids as number[]).map(Number));
    return { ungrouped: args.tab_ids };
  },
};

// ── Sessions ──────────────────────────────────────────────────────

export const getRecentlyClosed: ToolDefinition = {
  name: 'get_recently_closed',
  description: 'List recently closed tabs and windows that can be restored.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'history',
  async execute() {
    if (!chrome.sessions) return { error: 'Sessions API unavailable.' };
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 20 });
    return {
      sessions: sessions.map((s) => ({
        tab: s.tab ? { title: s.tab.title, url: s.tab.url, sessionId: s.tab.sessionId } : undefined,
        window: s.window ? { sessionId: s.window.sessionId, tabs: s.window.tabs?.length } : undefined,
      })),
    };
  },
};

export const restoreSession: ToolDefinition = {
  name: 'restore_session',
  description: 'Restore a recently closed tab/window. Omit session_id to restore the most recent.',
  parameters: { type: 'object', properties: { session_id: { type: 'string' } } },
  destructive: false,
  timeout: 'tab',
  async execute(args) {
    if (!chrome.sessions) return { error: 'Sessions API unavailable.' };
    const restored = await chrome.sessions.restore(
      args.session_id ? String(args.session_id) : undefined,
    );
    return { restored: !!restored };
  },
};

// ── Reading list ──────────────────────────────────────────────────

export const addToReadingList: ToolDefinition = {
  name: 'add_to_reading_list',
  description: 'Save a page to the Chrome Reading List.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' }, title: { type: 'string' } },
    required: ['url', 'title'],
  },
  destructive: false,
  timeout: 'history',
  async execute(args) {
    const rl = (chrome as unknown as { readingList?: { addEntry(e: object): Promise<void> } }).readingList;
    if (!rl) return { error: 'Reading list API unavailable (Chrome 120+).' };
    await rl.addEntry({ url: String(args.url), title: String(args.title), hasBeenRead: false });
    return { added: String(args.url) };
  },
};

export const getReadingList: ToolDefinition = {
  name: 'get_reading_list',
  description: 'List entries in the Chrome Reading List.',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'history',
  async execute() {
    const rl = (chrome as unknown as { readingList?: { query(q: object): Promise<unknown[]> } }).readingList;
    if (!rl) return { error: 'Reading list API unavailable (Chrome 120+).' };
    return { entries: await rl.query({}) };
  },
};

// ── Search ────────────────────────────────────────────────────────

export const searchWithProvider: ToolDefinition = {
  name: 'search_with_provider',
  description: "Search using Chrome's default search engine in a new or the current tab.",
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' }, new_tab: { type: 'boolean' } },
    required: ['query'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args) {
    if (!chrome.search) return { error: 'Search API unavailable.' };
    await chrome.search.query({
      text: String(args.query),
      disposition: args.new_tab === false ? 'CURRENT_TAB' : 'NEW_TAB',
    });
    return { searched: String(args.query) };
  },
};

export const chromeExtraTools = [
  groupTabs,
  listTabGroups,
  ungroupTabs,
  getRecentlyClosed,
  restoreSession,
  addToReadingList,
  getReadingList,
  searchWithProvider,
];
