/**
 * Extended page-reading tools (PLAN §11 + tool ideas). All via programmatic
 * injection. Content read from pages is untrusted external input (PLAN §28).
 */
import type { ToolDefinition } from '../types';

async function tabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

async function inject<T>(
  id: number,
  func: () => T,
): Promise<T | { error: string }> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: id }, func });
    return res?.result as T;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const getPageTitle: ToolDefinition = {
  name: 'get_page_title',
  description: 'Get the title of the active tab.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const tab = await chrome.tabs.get(await tabId(args, ctx.getActiveTabId));
    return { title: tab.title };
  },
};

export const getPageLinks: ToolDefinition = {
  name: 'get_page_links',
  description: 'Get up to 100 links on the page with their text and href.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    return inject(await tabId(args, ctx.getActiveTabId), () => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
        .slice(0, 100)
        .map((a) => ({ text: a.innerText.trim().slice(0, 80), href: a.href }));
      return { links };
    });
  },
};

export const getSelectedText: ToolDefinition = {
  name: 'get_selected_text',
  description: 'Get the text the user has currently selected on the page.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    return inject(await tabId(args, ctx.getActiveTabId), () => ({
      text: window.getSelection()?.toString() ?? '',
    }));
  },
};

export const getPageMetadata: ToolDefinition = {
  name: 'get_page_metadata',
  description:
    'Extract structured metadata: Open Graph, Twitter cards, meta description, and JSON-LD.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    return inject(await tabId(args, ctx.getActiveTabId), () => {
      const meta: Record<string, string> = {};
      document.querySelectorAll('meta[property], meta[name]').forEach((m) => {
        const key = m.getAttribute('property') || m.getAttribute('name');
        const val = m.getAttribute('content');
        if (key && val && (key.startsWith('og:') || key.startsWith('twitter:') || key === 'description'))
          meta[key] = val.slice(0, 300);
      });
      const jsonLd: unknown[] = [];
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          jsonLd.push(JSON.parse(s.textContent || ''));
        } catch {
          /* ignore malformed */
        }
      });
      return { meta, jsonLd: jsonLd.slice(0, 5) };
    });
  },
};

export const extractTableData: ToolDefinition = {
  name: 'extract_table_data',
  description: 'Parse HTML tables on the page into arrays of rows. Returns up to 5 tables.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    return inject(await tabId(args, ctx.getActiveTabId), () => {
      const tables = Array.from(document.querySelectorAll('table'))
        .slice(0, 5)
        .map((table) =>
          Array.from(table.querySelectorAll('tr'))
            .slice(0, 100)
            .map((tr) =>
              Array.from(tr.querySelectorAll('th,td')).map((c) =>
                (c as HTMLElement).innerText.trim().slice(0, 200),
              ),
            ),
        );
      return { tables };
    });
  },
};

export const getPagePerformance: ToolDefinition = {
  name: 'get_page_performance',
  description: 'Get page load performance metrics (load time, DOM size, resource count).',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    return inject(await tabId(args, ctx.getActiveTabId), () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return {
        loadTimeMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
        domNodes: document.getElementsByTagName('*').length,
        resources: performance.getEntriesByType('resource').length,
      };
    });
  },
};

export const checkHttps: ToolDefinition = {
  name: 'check_https',
  description: 'Check whether the active tab is on a secure (HTTPS) connection.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const tab = await chrome.tabs.get(await tabId(args, ctx.getActiveTabId));
    const url = tab.url ?? '';
    return { secure: url.startsWith('https://'), url };
  },
};

export const pageReadTools = [
  getPageTitle,
  getPageLinks,
  getSelectedText,
  getPageMetadata,
  extractTableData,
  getPagePerformance,
  checkHttps,
];
