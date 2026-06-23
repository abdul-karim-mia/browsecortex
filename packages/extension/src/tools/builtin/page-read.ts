/**
 * Extended page-reading tools (PLAN §11 + tool ideas). All via programmatic
 * injection. Content read from pages is untrusted external input (PLAN §28).
 */
import type { ToolDefinition } from '../types';
import { findFrameId } from './interaction';

async function tabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  return typeof args.tab_id === 'number' ? args.tab_id : getActive();
}

async function inject<T>(id: number, frameId: number, func: () => T): Promise<T | { error: string }> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [frameId] }, func });
    return res?.result as T;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const getPageTitle: ToolDefinition = {
  name: 'get_page_title',
  description: 'Get the title of the active tab or a specific iframe.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' }
    }
  },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    if (targetFrameId > 0) {
      const title = await inject(tabIdVal, targetFrameId, () => document.title);
      return typeof title === 'object' && title !== null && 'error' in title ? title : { title: title as string };
    }
    const tab = await chrome.tabs.get(tabIdVal);
    return { title: tab.title };
  },
};

export const getPageLinks: ToolDefinition = {
  name: 'get_page_links',
  description: 'Get links on the page with their text and href, optionally filtering or grouping by section.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      max_results: { type: 'number', description: 'Maximum results to return (default 100).' },
      group_by_section: { type: 'boolean', description: 'Organize links under their nearest heading.' },
      filter_type: {
        type: 'string',
        enum: ['all', 'internal', 'external', 'anchor'],
        description: 'Filter type of links (default "all").',
      },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    const maxResults = Number(args.max_results) || 100;
    const filterType = (args.filter_type as string) || 'all';
    const groupBySection = !!args.group_by_section;

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal, frameIds: [targetFrameId] },
        func: (max: number, filt: string, group: boolean) => {
          const elements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, a[href]'));
          let currentHeading = 'Header / Navigation';
          const results: any[] = [];
          const origin = window.location.origin;

          for (const el of elements) {
            if (el.tagName.startsWith('H') && el.tagName.length === 2) {
              currentHeading = el.textContent?.trim().slice(0, 100) || currentHeading;
              continue;
            }
            if (el.tagName === 'A') {
              const a = el as HTMLAnchorElement;
              const href = a.href;
              const text = a.innerText.trim().slice(0, 100);

              const isAnchor = href.includes('#') && (href.split('#')[0] === window.location.href.split('#')[0] || href.startsWith('#'));
              let type: 'internal' | 'external' | 'anchor' = 'external';
              if (isAnchor) {
                type = 'anchor';
              } else if (href.startsWith('/') || href.startsWith('.') || href.startsWith(origin)) {
                type = 'internal';
              }

              if (filt !== 'all') {
                if (filt === 'anchor' && type !== 'anchor') continue;
                if (filt === 'internal' && type !== 'internal') continue;
                if (filt === 'external' && type !== 'external') continue;
              }

              results.push({
                text,
                href,
                type,
                ...(group ? { section: currentHeading } : {}),
              });

              if (results.length >= max) break;
            }
          }
          return results;
        },
        args: [maxResults, filterType, groupBySection],
      });
      return { links: (res?.result as any[]) || [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const getSelectedText: ToolDefinition = {
  name: 'get_selected_text',
  description: 'Get the text the user has currently selected on the page.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    }
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return inject(tabIdVal, targetFrameId, () => ({
      text: window.getSelection()?.toString() ?? '',
    }));
  },
};

export const getPageMetadata: ToolDefinition = {
  name: 'get_page_metadata',
  description:
    'Extract structured metadata: Open Graph, Twitter cards, meta description, and JSON-LD.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    }
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return inject(tabIdVal, targetFrameId, () => {
      const meta: Record<string, string> = {};
      document.querySelectorAll('meta[property], meta[name]').forEach((m) => {
        const key = m.getAttribute('property') || m.getAttribute('name');
        const val = m.getAttribute('content');
        if (
          key &&
          val &&
          (key.startsWith('og:') || key.startsWith('twitter:') || key === 'description')
        )
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
  description: 'Parse HTML tables on the page into arrays or custom formats.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      max_tables: { type: 'number', description: 'Maximum tables to return (default 5).' },
      table_index: { type: 'number', description: 'Get a specific table by its 0-based index.' },
      include_headers: { type: 'boolean', description: 'Treat first row as header (default false).' },
      format: {
        type: 'string',
        enum: ['array', 'json', 'csv'],
        description: 'Output format of tables (default "array").',
      },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    const maxTables = Number(args.max_tables) || 5;
    const tableIndex = args.table_index !== undefined ? Number(args.table_index) : null;
    const includeHeaders = !!args.include_headers;
    const format = (args.format as 'array' | 'json' | 'csv') || 'array';

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal, frameIds: [targetFrameId] },
        func: (max: number, idx: number | null, incHeaders: boolean, fmt: string) => {
          const tables = Array.from(document.querySelectorAll('table'));
          const targets = idx !== null 
            ? (tables[idx] ? [tables[idx]] : [])
            : tables.slice(0, max);

          const escapeCSV = (str: string) => {
            if (/[",\n]/.test(str)) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          };

          return targets.map((table) => {
            const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
              Array.from(tr.querySelectorAll('th,td')).map((c) =>
                (c as HTMLElement).innerText.trim()
              )
            );

            if (rows.length === 0) return { format: fmt, data: [] };

            let headers: string[] = [];
            let startIdx = 0;
            if (incHeaders) {
              headers = rows[0];
              startIdx = 1;
            }

            if (fmt === 'json') {
              const jsonData: Array<Record<string, string>> = [];
              for (let i = startIdx; i < rows.length; i++) {
                const row = rows[i];
                const obj: Record<string, string> = {};
                const len = Math.max(headers.length, row.length);
                for (let j = 0; j < len; j++) {
                  const key = headers[j] || `column_${j + 1}`;
                  obj[key] = row[j] || '';
                }
                jsonData.push(obj);
              }
              return { format: fmt, data: jsonData };
            }

            if (fmt === 'csv') {
              const csvLines = rows.map(row => row.map(escapeCSV).join(','));
              return { format: fmt, data: csvLines.join('\n') };
            }

            return { format: fmt, data: rows };
          });
        },
        args: [maxTables, tableIndex, includeHeaders, format],
      });
      return { tables: (res?.result as any[]) || [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const getPagePerformance: ToolDefinition = {
  name: 'get_page_performance',
  description: 'Get page load performance metrics (load time, DOM size, resource count).',
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
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    return inject(tabIdVal, targetFrameId, () => {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
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
  description: 'Check whether the active tab or a specific iframe is on a secure (HTTPS) connection.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' }
    }
  },
  destructive: false,
  timeout: 'tab',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let url = '';
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal, frameIds: [resolved] },
        func: () => location.href,
      });
      url = res?.result as string || '';
    } else {
      const tab = await chrome.tabs.get(tabIdVal);
      url = tab.url ?? '';
    }
    return { secure: url.startsWith('https://'), url };
  },
};

export const querySelectorAll: ToolDefinition = {
  name: 'query_selector_all',
  description: 'Query all elements matching a CSS selector and retrieve their attributes and text.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector to query.' },
      attributes: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of attributes to retrieve (e.g. ["href", "class", "id"]).',
      },
      max_results: { type: 'number', description: 'Maximum results to return (default 100).' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
    required: ['selector'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    const selector = String(args.selector);
    const attributes = (args.attributes as string[]) || [];
    const maxResults = Number(args.max_results) || 100;

    const runQuery = (sel: string, attrs: string[], max: number) => {
      const elements = Array.from(document.querySelectorAll(sel)).slice(0, max);
      return elements.map((el) => {
        const item: Record<string, string> = {
          text: (el as HTMLElement).innerText?.trim().slice(0, 200) || '',
          tagName: el.tagName.toLowerCase(),
        };
        for (const attr of attrs) {
          item[attr] = el.getAttribute(attr) || '';
        }
        return item;
      });
    };

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal, frameIds: [targetFrameId] },
        func: runQuery,
        args: [selector, attributes, maxResults],
      });
      return { elements: (res?.result as any[]) || [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const getDomSnapshot: ToolDefinition = {
  name: 'get_dom_snapshot',
  description: 'Retrieve a structured JSON representation of the DOM tree starting from a selector.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the root element (default "body").' },
      max_depth: { type: 'number', description: 'Maximum tree depth to traverse (default 5, max 10).' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabIdVal = await tabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    const selector = args.selector ? String(args.selector) : 'body';
    const maxDepth = Math.min(Number(args.max_depth) || 5, 10);

    const getSnapshot = (sel: string, depthLimit: number) => {
      const root = document.querySelector(sel);
      if (!root) return null;

      interface SerializedNode {
        tagName: string;
        id?: string;
        className?: string;
        text?: string;
        attributes: Record<string, string>;
        children?: SerializedNode[];
      }

      const serialize = (node: Node, depth: number): SerializedNode | null => {
        if (node.nodeType !== Node.ELEMENT_NODE) return null;
        const el = node as Element;
        const attrs: Record<string, string> = {};
        for (const attr of Array.from(el.attributes)) {
          attrs[attr.name] = attr.value;
        }

        const serialized: SerializedNode = {
          tagName: el.tagName.toLowerCase(),
          id: el.id || undefined,
          className: el.className || undefined,
          attributes: attrs,
        };

        const children: SerializedNode[] = [];
        if (depth < depthLimit) {
          for (const child of Array.from(el.childNodes)) {
            const sChild = serialize(child, depth + 1);
            if (sChild) children.push(sChild);
          }
        }

        if (children.length > 0) {
          serialized.children = children;
        } else {
          serialized.text = (el as HTMLElement).innerText?.trim().slice(0, 100) || undefined;
        }

        return serialized;
      };

      return serialize(root, 0);
    };

    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal, frameIds: [targetFrameId] },
        func: getSnapshot,
        args: [selector, maxDepth],
      });
      if (!res?.result) return { error: `Element not found or snapshot failed for selector: ${selector}` };
      return { snapshot: res.result };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const getConsoleLogs: ToolDefinition = {
  name: 'get_console_logs',
  description: 'Retrieve console logs (log, info, warn, error) captured on the active tab.',
  parameters: {
    type: 'object',
    properties: {
      levels: {
        type: 'array',
        items: { type: 'string', enum: ['log', 'info', 'warn', 'error', 'debug'] },
        description: 'Filter logs by level. Defaults to all.',
      },
      clear: {
        type: 'boolean',
        description: 'Whether to clear the log buffer after reading.',
      },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    try {
      const tabIdVal = await tabId(args, ctx.getActiveTabId);
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal },
        func: (levels?: string[], clear?: boolean) => {
          const logs = (window as any).__browsecortex_logs || [];
          const filtered = levels && levels.length > 0
            ? logs.filter((l: any) => levels.includes(l.level))
            : logs;
          if (clear) {
            (window as any).__browsecortex_logs = [];
          }
          return filtered;
        },
        args: [args.levels as string[], !!args.clear],
      });
      return { logs: (res?.result as any[]) || [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const getNetworkRequests: ToolDefinition = {
  name: 'get_network_requests',
  description: 'Retrieve network requests (fetch/XHR) captured on the active tab.',
  parameters: {
    type: 'object',
    properties: {
      url_pattern: {
        type: 'string',
        description: 'Optional glob pattern or substring to filter request URLs.',
      },
      method: {
        type: 'string',
        description: 'Optional HTTP method to filter (e.g. GET, POST).',
      },
      status_code: {
        type: 'number',
        description: 'Optional HTTP status code to filter by.',
      },
      content_type: {
        type: 'string',
        description: 'Optional response content-type substring to filter by (e.g. "application/json").',
      },
      body: {
        type: 'boolean',
        description: 'Whether to include request/response bodies in the output (default false).',
      },
      since_last_check: {
        type: 'boolean',
        description: 'Only return new entries since the last call to this tool on this tab.',
      },
      clear: {
        type: 'boolean',
        description: 'Whether to clear the request buffer after reading.',
      },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    try {
      const tabIdVal = await tabId(args, ctx.getActiveTabId);
      const sinceLastCheck = !!args.since_last_check;
      const lastIdKey = `last_net_id_${tabIdVal}`;
      
      let lastId: string | undefined = undefined;
      if (sinceLastCheck) {
        const stored = await chrome.storage.session.get(lastIdKey);
        lastId = stored[lastIdKey] as string | undefined;
      }

      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tabIdVal },
        func: (
          urlPattern?: string,
          method?: string,
          statusCode?: number,
          contentType?: string,
          body?: boolean,
          lastIdVal?: string,
          clear?: boolean
        ) => {
          const requests = (window as any).__browsecortex_requests || [];
          
          let filtered = requests;
          if (lastIdVal) {
            const idx = requests.findIndex((r: any) => r.id === lastIdVal);
            if (idx !== -1) {
              filtered = requests.slice(idx + 1);
            }
          }

          if (urlPattern) {
            const pat = urlPattern.toLowerCase();
            filtered = filtered.filter((r: any) => r.url.toLowerCase().includes(pat));
          }
          if (method) {
            const m = method.toUpperCase();
            filtered = filtered.filter((r: any) => r.method.toUpperCase() === m);
          }
          if (statusCode !== undefined) {
            filtered = filtered.filter((r: any) => r.status === statusCode);
          }
          if (contentType) {
            const ct = contentType.toLowerCase();
            filtered = filtered.filter((r: any) => 
              r.contentType && r.contentType.toLowerCase().includes(ct)
            );
          }

          const results = filtered.map((r: any) => {
            const item: any = {
              id: r.id,
              method: r.method,
              url: r.url,
              type: r.type,
              timestamp: r.timestamp,
              status: r.status,
              contentType: r.contentType,
            };
            if (body) {
              item.requestBody = r.requestBody;
              item.responseBody = r.responseBody;
            }
            return item;
          });

          if (clear) {
            (window as any).__browsecortex_requests = [];
          }

          return {
            requests: results,
            lastId: requests.length > 0 ? requests[requests.length - 1].id : undefined
          };
        },
        args: [
          args.url_pattern as string,
          args.method as string,
          args.status_code as number,
          args.content_type as string,
          !!args.body,
          lastId,
          !!args.clear,
        ],
      });

      const data = res?.result as { requests: any[]; lastId?: string } | undefined;
      if (data && sinceLastCheck && data.lastId) {
        await chrome.storage.session.set({ [lastIdKey]: data.lastId });
      }

      return { requests: data?.requests || [] };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const clearConsoleLogs: ToolDefinition = {
  name: 'clear_console_logs',
  description: 'Clear the accumulated console log buffer for the active/specified tab.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' } },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    try {
      const id = await tabId(args, ctx.getActiveTabId);
      await chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => {
          (window as any).__browsecortex_logs = [];
        },
      });
      return { cleared: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const clearNetworkRequests: ToolDefinition = {
  name: 'clear_network_requests',
  description: 'Clear the accumulated network request buffer for the active/specified tab.',
  parameters: {
    type: 'object',
    properties: { tab_id: { type: 'number' } },
  },
  destructive: false,
  timeout: 'page_read',
  async execute(args, ctx) {
    try {
      const id = await tabId(args, ctx.getActiveTabId);
      await chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => {
          (window as any).__browsecortex_requests = [];
        },
      });
      return { cleared: true };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};

export const getPageHtml: ToolDefinition = {
  name: 'get_page_html',
  description: 'Retrieve the raw HTML source of the page or a selector\'s inner/outer HTML.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'Optional CSS selector. If specified, returns the HTML of that element.' },
      outer: { type: 'boolean', description: 'If true and selector is provided, returns outerHTML instead of innerHTML (default false).' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    try {
      const id = await tabId(args, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (args.frame_selector) {
        const resolved = await findFrameId(id, String(args.frame_selector));
        if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
        targetFrameId = resolved;
      }
      const selector = args.selector ? String(args.selector) : undefined;
      const outer = !!args.outer;
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: id, frameIds: [targetFrameId] },
        func: (sel?: string, out?: boolean) => {
          if (sel) {
            const el = document.querySelector(sel);
            if (!el) return null;
            return out ? el.outerHTML : el.innerHTML;
          }
          return document.documentElement.outerHTML;
        },
        args: [selector, outer],
      });
      if (res?.result === null) {
        return { error: `Element not found for selector: ${selector}` };
      }
      return { html: res?.result as string };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
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
  querySelectorAll,
  getDomSnapshot,
  getConsoleLogs,
  getNetworkRequests,
  clearConsoleLogs,
  clearNetworkRequests,
  getPageHtml,
];
