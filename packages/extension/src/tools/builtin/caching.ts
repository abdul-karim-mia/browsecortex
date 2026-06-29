/**
 * Caching tools for multi-step workflows.
 * Allows agents to store and retrieve data across page navigations.
 * Based on Nanobrowser's cache_content pattern.
 */
import type { ToolDefinition } from '../types';

async function getTabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

// In-memory cache: tabId -> Map<key, {value, timestamp}>
const cacheStore = new Map<number, Map<string, { value: string; timestamp: number }>>();

const CACHE_TTL = 3600000; // 1 hour

export const cacheContent: ToolDefinition = {
  name: 'cache_content',
  description:
    'Store text content for retrieval in later steps. Useful for multi-step workflows where data from one step is needed later.',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Unique key to store the value under' },
      value: { type: 'string', description: 'Content to cache (max 10,000 characters)' },
      tab_id: { type: 'number' },
    },
    required: ['key', 'value'],
  },
  destructive: false,
  timeout: 'instant',
  async execute(args, ctx) {
    const tabId = await getTabId(args, ctx.getActiveTabId);
    const key = String(args.key);
    const value = String(args.value).slice(0, 10000);

    if (!key) {
      return { error: 'Key cannot be empty' };
    }

    if (!cacheStore.has(tabId)) {
      cacheStore.set(tabId, new Map());
    }

    const tabCache = cacheStore.get(tabId)!;
    tabCache.set(key, { value, timestamp: Date.now() });

    return {
      cached: true,
      key,
      valueLength: value.length,
      ttlSeconds: 3600,
    };
  },
};

export const getCachedContent: ToolDefinition = {
  name: 'get_cached_content',
  description: 'Retrieve previously cached content by key. Returns all cached entries if no key specified.',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Optional specific key to retrieve. If omitted, returns all cached items.' },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  timeout: 'instant',
  async execute(args, ctx) {
    const tabId = await getTabId(args, ctx.getActiveTabId);
    const key = args.key ? String(args.key) : undefined;

    const tabCache = cacheStore.get(tabId);
    if (!tabCache || tabCache.size === 0) {
      return { cached: false, message: 'No cached content for this tab' };
    }

    // Clean expired entries
    const now = Date.now();
    for (const [k, v] of tabCache.entries()) {
      if (now - v.timestamp > CACHE_TTL) {
        tabCache.delete(k);
      }
    }

    if (key) {
      const entry = tabCache.get(key);
      if (!entry) {
        return { cached: false, message: `Key "${key}" not found` };
      }
      return {
        cached: true,
        key,
        value: entry.value,
        ageSeconds: Math.round((now - entry.timestamp) / 1000),
      };
    }

    // Return all cached items
    const items: Record<string, { value: string; ageSeconds: number }> = {};
    for (const [k, v] of tabCache.entries()) {
      items[k] = {
        value: v.value.slice(0, 100) + (v.value.length > 100 ? '...' : ''),
        ageSeconds: Math.round((now - v.timestamp) / 1000),
      };
    }

    return {
      cached: true,
      itemCount: tabCache.size,
      items,
    };
  },
};

export const clearCache: ToolDefinition = {
  name: 'clear_cache',
  description: 'Clear cached content for the current tab. Optionally clear a specific key.',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Optional specific key to clear. If omitted, clears all cache for tab.' },
      tab_id: { type: 'number' },
    },
  },
  destructive: true,
  timeout: 'instant',
  async execute(args, ctx) {
    const tabId = await getTabId(args, ctx.getActiveTabId);
    const key = args.key ? String(args.key) : undefined;

    const tabCache = cacheStore.get(tabId);
    if (!tabCache) {
      return { cleared: false, message: 'No cache for this tab' };
    }

    if (key) {
      const existed = tabCache.has(key);
      if (existed) {
        tabCache.delete(key);
      }
      return { cleared: existed, key, message: existed ? 'Cleared' : 'Key not found' };
    }

    const size = tabCache.size;
    cacheStore.delete(tabId);
    return { cleared: true, itemsCleared: size };
  },
};

export const cachingTools = [cacheContent, getCachedContent, clearCache];
