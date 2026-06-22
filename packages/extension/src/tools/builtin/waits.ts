/**
 * Waiting + scrolling tools (PLAN §10, §11 + tool ideas). SPA-aware waits via
 * in-page polling/observers, so they work where tab load events don't fire.
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

export const waitForPageLoad: ToolDefinition = {
  name: 'wait_for_page_load',
  description: 'Wait until the tab finishes loading (document complete).',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' }, timeout_ms: { type: 'number' } },
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    // Brief grace period before the first check: if a navigation was just
    // triggered (e.g. right after navigate_to), the tab can still report the
    // *previous* page's 'complete' status for a moment — checking instantly
    // would falsely report success against the stale page.
    await new Promise((r) => setTimeout(r, 150));
    const deadline = Date.now() + (Number(args.timeout_ms) || 12_000);
    while (Date.now() < deadline) {
      const tab = await chrome.tabs.get(id);
      if (tab.status === 'complete') return { loaded: true, url: tab.url };
      await new Promise((r) => setTimeout(r, 250));
    }
    return { loaded: false, note: 'Timed out waiting for load.' };
  },
};

export const waitForNetworkIdle: ToolDefinition = {
  name: 'wait_for_network_idle',
  description:
    'Wait until network activity goes quiet (no new resource requests for ~1s). Use for SPAs.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' }, timeout_ms: { type: 'number' } },
  },
  destructive: false,
  timeout: 'network_idle',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      async (timeoutMs: number) => {
        const start = Date.now();
        let lastCount = performance.getEntriesByType('resource').length;
        let quietSince = Date.now();
        while (Date.now() - start < timeoutMs) {
          await new Promise((r) => setTimeout(r, 200));
          const count = performance.getEntriesByType('resource').length;
          if (count !== lastCount) {
            lastCount = count;
            quietSince = Date.now();
          } else if (Date.now() - quietSince > 1000) {
            return { idle: true };
          }
        }
        return { idle: false, note: 'Timed out.' };
      },
      [Number(args.timeout_ms) || 10_000],
    );
  },
};

function waitElement(name: string, mode: 'appear' | 'disappear'): ToolDefinition {
  return {
    name,
    description:
      mode === 'appear'
        ? 'Wait until an element matching a CSS selector appears.'
        : 'Wait until an element matching a CSS selector disappears.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        timeout_ms: { type: 'number' },
        tab_id: { type: 'number' },
      },
      required: ['selector'],
    },
    destructive: false,
    timeout: 'navigation',
    async execute(args, ctx) {
      return runInPage(
        await tabId(args, ctx.getActiveTabId),
        async (selector: string, timeoutMs: number, wantPresent: boolean) => {
          const start = Date.now();
          while (Date.now() - start < timeoutMs) {
            const present = !!document.querySelector(selector);
            if (present === wantPresent) return { ok: true };
            await new Promise((r) => setTimeout(r, 200));
          }
          return { ok: false, note: 'Timed out.' };
        },
        [String(args.selector), Number(args.timeout_ms) || 10_000, mode === 'appear'],
      );
    },
  };
}

export const waitForElement = waitElement('wait_for_element', 'appear');
export const waitForElementToDisappear = waitElement('wait_for_element_to_disappear', 'disappear');

export const waitForText: ToolDefinition = {
  name: 'wait_for_text',
  description: 'Wait until specific text appears anywhere on the page.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      timeout_ms: { type: 'number' },
      tab_id: { type: 'number' },
    },
    required: ['text'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      async (text: string, timeoutMs: number) => {
        const start = Date.now();
        const needle = text.toLowerCase();
        while (Date.now() - start < timeoutMs) {
          if ((document.body?.innerText ?? '').toLowerCase().includes(needle)) return { found: true };
          await new Promise((r) => setTimeout(r, 250));
        }
        return { found: false, note: 'Timed out.' };
      },
      [String(args.text), Number(args.timeout_ms) || 10_000],
    );
  },
};

export const getScrollPosition: ToolDefinition = {
  name: 'get_scroll_position',
  description: 'Get the current scroll position and page dimensions.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      () => ({
        x: window.scrollX,
        y: window.scrollY,
        maxY: document.body.scrollHeight - window.innerHeight,
      }),
      [],
    );
  },
};

export const setScrollPosition: ToolDefinition = {
  name: 'set_scroll_position',
  description: 'Scroll the page to exact x/y coordinates.',
  parameters: {
    type: 'object',
    properties: { x: { type: 'number' }, y: { type: 'number' }, tab_id: { type: 'number' } },
    required: ['y'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      (x: number, y: number) => {
        window.scrollTo(x, y);
        return { x: window.scrollX, y: window.scrollY };
      },
      [Number(args.x) || 0, Number(args.y) || 0],
    );
  },
};

export const infiniteScrollLoad: ToolDefinition = {
  name: 'infinite_scroll_load',
  description:
    'Repeatedly scroll to the bottom to trigger lazy loading until no more content loads or a cap is reached.',
  parameters: {
    type: 'object',
    properties: { max_scrolls: { type: 'number' }, tab_id: { type: 'number' } },
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    return runInPage(
      await tabId(args, ctx.getActiveTabId),
      async (maxScrolls: number) => {
        let last = 0;
        let scrolls = 0;
        for (; scrolls < maxScrolls; scrolls++) {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((r) => setTimeout(r, 800));
          const height = document.body.scrollHeight;
          if (height === last) break;
          last = height;
        }
        return { scrolls, finalHeight: document.body.scrollHeight };
      },
      [Math.min(Number(args.max_scrolls) || 10, 30)],
    );
  },
};

export const waitTools = [
  waitForPageLoad,
  waitForNetworkIdle,
  waitForElement,
  waitForElementToDisappear,
  waitForText,
  getScrollPosition,
  setScrollPosition,
  infiniteScrollLoad,
];
