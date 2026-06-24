/**
 * Waiting + scrolling tools (PLAN §10, §11 + tool ideas). SPA-aware waits via
 * in-page polling/observers, so they work where tab load events don't fire.
 */
import type { ToolDefinition, ToolResult } from '../types';
import { findFrameId } from './interaction';

async function tabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

async function runInPage<A extends unknown[]>(
  id: number,
  frameId: number,
  func: (...a: A) => unknown,
  args: A,
): Promise<ToolResult> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [frameId] }, func, args });
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
    properties: {
      tab_id: { type: 'number' },
      timeout_ms: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'network_idle',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(id, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      id,
      targetFrameId,
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
        frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
      },
      required: ['selector'],
    },
    destructive: false,
    timeout: 'navigation',
    async execute(args, ctx) {
      const id = await tabId(args, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (args.frame_selector) {
        const resolved = await findFrameId(id, String(args.frame_selector));
        if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
        targetFrameId = resolved;
      }
      return runInPage(
        id,
        targetFrameId,
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
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['text'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(id, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      id,
      targetFrameId,
      async (text: string, timeoutMs: number) => {
        const start = Date.now();
        const needle = text.toLowerCase();
        while (Date.now() - start < timeoutMs) {
          if ((document.body?.innerText ?? '').toLowerCase().includes(needle))
            return { found: true };
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
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    }
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(id, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      id,
      targetFrameId,
      () => {
        const doc = document.documentElement;
        const scrollHeight = Math.max(document.body.scrollHeight, doc.scrollHeight);
        const scrollWidth = Math.max(document.body.scrollWidth, doc.scrollWidth);
        return {
          x: window.scrollX,
          y: window.scrollY,
          maxX: Math.max(0, scrollWidth - window.innerWidth),
          maxY: Math.max(0, scrollHeight - window.innerHeight),
        };
      },
      [],
    );
  },
};

export const setScrollPosition: ToolDefinition = {
  name: 'set_scroll_position',
  description: 'Scroll the page to exact x/y coordinates.',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['y'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(id, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      id,
      targetFrameId,
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
    properties: {
      max_scrolls: { type: 'number' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(id, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      id,
      targetFrameId,
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

export const waitForCondition: ToolDefinition = {
  name: 'wait_for_condition',
  description: 'Wait until a custom JavaScript expression evaluates to truthy.',
  parameters: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'JavaScript expression to evaluate (e.g. "window.loaded === true").' },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 10,000).' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['script'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(id, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return runInPage(
      id,
      targetFrameId,
      async (script: string, timeoutMs: number) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const res = eval(script);
            if (res) return { ok: true };
          } catch (e) {
            // Ignore syntax/runtime errors during polling
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        return { ok: false, note: 'Timed out waiting for condition.' };
      },
      [String(args.script), Number(args.timeout_ms) || 10_000],
    );
  },
};

export const waitForUrl: ToolDefinition = {
  name: 'wait_for_url',
  description: "Wait until the tab's URL matches a pattern (substring, exact, glob, or regex).",
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL pattern to match.' },
      match: {
        type: 'string',
        enum: ['substring', 'exact', 'glob', 'regex'],
        description: 'The matching method to use (default "substring").',
      },
      timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 10,000).' },
      tab_id: { type: 'number', description: 'The tab ID to check.' },
    },
    required: ['url'],
  },
  destructive: false,
  timeout: 'navigation',
  async execute(args, ctx) {
    const id = await tabId(args, ctx.getActiveTabId);
    const targetUrl = String(args.url);
    const mode = args.match || 'substring';
    const timeoutMs = Number(args.timeout_ms) || 10_000;
    const start = Date.now();

    let matches: (url: string) => boolean;
    if (mode === 'exact') {
      matches = (u) => u === targetUrl;
    } else if (mode === 'regex') {
      try {
        const re = new RegExp(targetUrl);
        matches = (u) => re.test(u);
      } catch (e) {
        return { error: `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}` };
      }
    } else if (mode === 'glob') {
      try {
        const escaped = targetUrl.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        matches = (u) => re.test(u);
      } catch (e) {
        return { error: `Invalid glob pattern: ${e instanceof Error ? e.message : String(e)}` };
      }
    } else {
      matches = (u) => u.includes(targetUrl);
    }

    while (Date.now() - start < timeoutMs) {
      try {
        const tab = await chrome.tabs.get(id);
        if (tab.url && matches(tab.url)) {
          return { ok: true, url: tab.url };
        }
      } catch (e) {
        // Tab might be loading or closed
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const finalTab = await chrome.tabs.get(id).catch(() => null);
    return { ok: false, url: finalTab?.url, note: 'Timed out waiting for URL.' };
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
  waitForCondition,
  waitForUrl,
];
