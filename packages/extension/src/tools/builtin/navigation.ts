/**
 * Navigation tools (PLAN §11). Acts on the active tab unless a tab_id is given.
 *
 * NOTE: go_back/go_forward use `executeScript` + `history.back()` / `history.forward()`
 * instead of `chrome.tabs.goBack` / `chrome.tabs.goForward` because those Chrome APIs
 * are unreliable in MV3 service workers (they often resolve before navigation starts
 * or silently no-op).
 */
import type { ToolDefinition, ToolResult } from '../types';

async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

function waitForTabLoad(tabId: number, timeoutMs = 10_000): Promise<ToolResult> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const handler = async (changedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changedTabId !== tabId) return;
      if (changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(handler);
        const tab = await chrome.tabs.get(tabId);
        resolve({ ok: true, url: tab.url });
      }
    };
    chrome.tabs.onUpdated.addListener(handler);
    (async () => {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(handler);
        return resolve({ ok: true, url: tab.url });
      }
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 250));
        const t = await chrome.tabs.get(tabId);
        if (t.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(handler);
          return resolve({ ok: true, url: t.url });
        }
      }
      chrome.tabs.onUpdated.removeListener(handler);
      resolve({ ok: false, error: 'Navigation timed out' });
    })();
  });
}

export const navigateTo: ToolDefinition = {
  name: 'navigate_to',
  description: 'Navigate the active tab (or a given tab) to a URL.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      tab_id: { type: 'number', description: 'Optional tab to navigate; defaults to active.' },
    },
    required: ['url'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    await chrome.tabs.update(tabId, { url: String(args.url) });
    return { navigated: String(args.url), tab_id: tabId };
  },
};

export const goBack: ToolDefinition = {
  name: 'go_back',
  description: 'Navigate back in the active tab history.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => history.back() });
      return waitForTabLoad(tabId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const goForward: ToolDefinition = {
  name: 'go_forward',
  description: 'Navigate forward in the active tab history.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: () => history.forward() });
      return waitForTabLoad(tabId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const navigationTools = [navigateTo, goBack, goForward];
