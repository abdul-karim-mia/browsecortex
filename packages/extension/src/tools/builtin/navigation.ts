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

/**
 * Polls for the back/forward navigation to land, comparing against the URL
 * captured *before* the navigation was triggered.
 *
 * Deliberately doesn't rely on chrome.tabs.onUpdated's 'complete' status
 * event alone: same-document / back-forward-cache restores (the common case
 * for history.back()/forward()) often don't fire that event at all, and
 * checking the tab's status right after triggering navigation is racy — it's
 * usually still 'complete' from *before* the navigation starts, which used to
 * make this resolve instantly with the stale URL.
 */
async function waitForNavigation(
  tabId: number,
  beforeUrl: string | undefined,
  timeoutMs = 10_000,
): Promise<ToolResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== beforeUrl && tab.status === 'complete') return { ok: true, url: tab.url };
    await new Promise((r) => setTimeout(r, 200));
  }
  // Timed out — but the URL may still have changed (e.g. a slow page); report
  // what actually happened instead of a blanket failure. If the URL never
  // changed, there was likely no history entry to navigate to.
  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== beforeUrl) return { ok: true, url: tab.url };
  return { ok: false, error: 'No navigation occurred (no history entry?)', url: tab.url };
}

/**
 * Waits for a tab to reach `status: 'complete'` after a navigation was just
 * triggered. Starts with a brief delay so an in-flight navigation has a
 * chance to flip the tab out of 'complete' first — checking immediately is
 * racy and used to report success against the *previous* page (the same bug
 * class fixed in waitForNavigation above).
 */
export async function waitForLoad(
  tabId: number,
  timeoutMs = 12_000,
): Promise<{ complete: boolean; url?: string }> {
  await new Promise((r) => setTimeout(r, 150));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return { complete: true, url: tab.url };
    await new Promise((r) => setTimeout(r, 200));
  }
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  return { complete: false, url: tab?.url };
}

/**
 * Resolves a user-supplied navigation target into a fully-qualified URL.
 *
 * Without this, a bare string like "not-a-valid-url" is treated by
 * chrome.tabs.update as a relative path and silently resolves against the
 * extension's own origin (chrome-extension://.../not-a-valid-url). We instead
 * require an explicit, recognised scheme — or a host that looks like a domain,
 * which we promote to https:// — and reject anything else with a clear error.
 */
function normalizeNavigationUrl(raw: string): { url: string } | { error: string } {
  const input = raw.trim();
  if (!input) return { error: 'No URL provided.' };

  // Already absolute with a scheme we accept.
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(input);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    const allowed = ['http', 'https', 'chrome', 'about', 'file', 'view-source', 'data'];
    if (!allowed.includes(scheme)) {
      return { error: `Refusing to navigate to unsupported scheme "${scheme}:".` };
    }
    return { url: input };
  }

  // No scheme: only promote to https:// if it plausibly looks like a host
  // (a dot-separated domain or localhost, with no spaces). Otherwise it's not
  // a navigable URL — surface an error rather than hitting the extension origin.
  const hostCandidate = input.split('/')[0];
  const looksLikeHost =
    !/\s/.test(input) &&
    (/^localhost(:\d+)?$/i.test(hostCandidate) || /^[^\s/]+\.[^\s/]+/.test(hostCandidate));
  if (looksLikeHost) return { url: `https://${input}` };

  return {
    error: `"${raw}" is not a valid URL. Include a scheme (e.g. https://) or a valid domain.`,
  };
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
    const normalized = normalizeNavigationUrl(String(args.url));
    if ('error' in normalized) return { error: normalized.error };
    const targetUrl = normalized.url;
    await chrome.tabs.update(tabId, { url: targetUrl });
    const { complete, url } = await waitForLoad(tabId);
    return {
      navigated: targetUrl,
      tab_id: tabId,
      loaded: complete,
      url: url ?? targetUrl,
      ...(complete
        ? {}
        : { note: 'Tab update was sent but the page had not finished loading by the timeout.' }),
    };
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
      const before = await chrome.tabs.get(tabId);
      await chrome.scripting.executeScript({ target: { tabId }, func: () => history.back() });
      return waitForNavigation(tabId, before.url);
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
      const before = await chrome.tabs.get(tabId);
      await chrome.scripting.executeScript({ target: { tabId }, func: () => history.forward() });
      return waitForNavigation(tabId, before.url);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const navigationTools = [navigateTo, goBack, goForward];
