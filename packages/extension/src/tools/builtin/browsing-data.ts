/**
 * History, bookmarks, and downloads tools (PLAN §11). Native Chrome APIs.
 */
import type { ToolDefinition } from '../types';

// ── History ───────────────────────────────────────────────────────

export const searchHistory: ToolDefinition = {
  name: 'search_history',
  description: 'Search browsing history for a query. Returns up to 20 entries.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' }, max_results: { type: 'number' } },
    required: ['query'],
  },
  destructive: false,
  timeout: 'history',
  async execute(args) {
    const items = await chrome.history.search({
      text: String(args.query),
      maxResults: Math.min(Number(args.max_results) || 20, 20),
      startTime: 0,
    });
    return { entries: items.map((i) => ({ title: i.title, url: i.url, visits: i.visitCount })) };
  },
};

export const getRecentHistory: ToolDefinition = {
  name: 'get_recent_history',
  description: 'Get the most recently visited pages (up to 20).',
  parameters: { type: 'object', properties: { max_results: { type: 'number' } } },
  destructive: false,
  timeout: 'history',
  async execute(args) {
    const items = await chrome.history.search({
      text: '',
      maxResults: Math.min(Number(args.max_results) || 20, 20),
      startTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
    });
    return { entries: items.map((i) => ({ title: i.title, url: i.url, lastVisit: i.lastVisitTime })) };
  },
};

export const deleteHistoryEntry: ToolDefinition = {
  name: 'delete_history_entry',
  description: 'Delete a specific URL from browsing history.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' } },
    required: ['url'],
  },
  destructive: true,
  timeout: 'history',
  async execute(args) {
    await chrome.history.deleteUrl({ url: String(args.url) });
    return { deleted: String(args.url) };
  },
};

// ── Bookmarks ─────────────────────────────────────────────────────

export const getBookmarks: ToolDefinition = {
  name: 'get_bookmarks',
  description: 'Get the bookmark tree (titles and URLs).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'history',
  async execute() {
    const tree = await chrome.bookmarks.getTree();
    const flat: { title: string; url?: string }[] = [];
    const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const n of nodes) {
        if (n.url) flat.push({ title: n.title, url: n.url });
        if (n.children) walk(n.children);
        if (flat.length >= 200) return;
      }
    };
    walk(tree);
    return { bookmarks: flat.slice(0, 200) };
  },
};

export const addBookmark: ToolDefinition = {
  name: 'add_bookmark',
  description: 'Add a bookmark for a URL.',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' }, url: { type: 'string' } },
    required: ['url'],
  },
  destructive: false,
  timeout: 'history',
  async execute(args) {
    const node = await chrome.bookmarks.create({
      title: (args.title as string) ?? String(args.url),
      url: String(args.url),
    });
    return { id: node.id, title: node.title };
  },
};

export const createBookmarkFolder: ToolDefinition = {
  name: 'create_bookmark_folder',
  description: 'Create a bookmark folder, optionally inside a parent folder.',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' }, parent_id: { type: 'string' } },
    required: ['title'],
  },
  destructive: false,
  timeout: 'history',
  async execute(args) {
    const node = await chrome.bookmarks.create({
      title: String(args.title),
      parentId: args.parent_id ? String(args.parent_id) : undefined,
    });
    return { id: node.id, title: node.title };
  },
};

export const deleteBookmark: ToolDefinition = {
  name: 'delete_bookmark',
  description: 'Delete a bookmark by its id.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  destructive: true,
  timeout: 'history',
  async execute(args) {
    await chrome.bookmarks.remove(String(args.id));
    return { deleted: String(args.id) };
  },
};

// ── Downloads ─────────────────────────────────────────────────────

export const downloadFile: ToolDefinition = {
  name: 'download_file',
  description: 'Download a file from a URL to the user\'s downloads folder.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string' }, filename: { type: 'string' } },
    required: ['url'],
  },
  destructive: false,
  timeout: 'history',
  async execute(args) {
    const id = await chrome.downloads.download({
      url: String(args.url),
      filename: args.filename ? String(args.filename) : undefined,
    });
    return { downloadId: id };
  },
};

export const getRecentDownloads: ToolDefinition = {
  name: 'get_recent_downloads',
  description: 'List recent downloads (filename, URL, state).',
  parameters: { type: 'object', properties: {} },
  destructive: false,
  timeout: 'history',
  async execute() {
    const items = await chrome.downloads.search({ limit: 20, orderBy: ['-startTime'] });
    return {
      downloads: items.map((d) => ({ filename: d.filename, url: d.url, state: d.state })),
    };
  },
};

export const browsingDataTools = [
  searchHistory,
  getRecentHistory,
  deleteHistoryEntry,
  getBookmarks,
  addBookmark,
  createBookmarkFolder,
  deleteBookmark,
  downloadFile,
  getRecentDownloads,
];
