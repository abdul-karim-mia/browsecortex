/**
 * DOM annotation for reliable clicking (PLAN §10).
 *
 * `annotate_page` numbers every interactive element with a visible [n] badge and
 * stashes element references in the isolated-world `window.__bmAnnotations`, then
 * returns a clean structural map. The agent then calls
 * `click_element({ annotation_id: n })` — far more reliable than CSS selectors.
 */
import type { ToolDefinition } from '../types';
import { findFrameId } from './interaction';

async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

export const annotatePage: ToolDefinition = {
  name: 'annotate_page',
  description:
    'Number all interactive elements (buttons, links, inputs) on the active tab with ' +
    'visible [n] labels and return a structural map. Then click by id with ' +
    'click_element({ annotation_id: n }). Use before interacting with a complex page.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      element_types: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of specific element types to annotate e.g. ["button", "a", "input"].',
      },
      selector: { type: 'string', description: 'Optional CSS selector of a container to scope annotation within.' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await resolveTabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    const elementTypes = args.element_types as string[] | undefined;
    const containerSelector = args.selector ? String(args.selector) : undefined;

    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tabIdVal, frameIds: [targetFrameId] },
      func: (types: string[] | null, containerSel: string | null) => {
        const w = window as unknown as { __bmAnnotations?: Element[] };
        document.querySelectorAll('[data-bm-badge]').forEach((b) => b.remove());

        let selector = 'a,button,input,textarea,select,[role="button"],[role="link"],summary';
        if (types && types.length > 0) {
          selector = types.map(t => {
            const term = t.trim().toLowerCase();
            if (term === 'button') return 'button,[role="button"]';
            if (term === 'link' || term === 'a') return 'a,[role="link"]';
            return term;
          }).join(',');
        }

        const container = containerSel ? document.querySelector(containerSel) : document;
        if (!container) return [];

        const els = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return (
            r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
          );
        });

        w.__bmAnnotations = els;
        const map = els.map((el, i) => {
          const id = i + 1;
          const r = el.getBoundingClientRect();
          const badge = document.createElement('div');
          badge.dataset.bmBadge = '1';
          badge.textContent = String(id);
          Object.assign(badge.style, {
            position: 'fixed',
            left: `${Math.max(0, r.left)}px`,
            top: `${Math.max(0, r.top)}px`,
            zIndex: '2147483647',
            background: '#2563eb',
            color: '#fff',
            font: '11px/1.4 monospace',
            padding: '0 3px',
            borderRadius: '3px',
            pointerEvents: 'none',
          });
          document.body.appendChild(badge);
          const label =
            (el as HTMLInputElement).placeholder ||
            el.innerText?.trim().slice(0, 60) ||
            el.getAttribute('aria-label') ||
            (el as HTMLInputElement).value ||
            '';
          return {
            id,
            tag: el.tagName.toLowerCase(),
            type: (el as HTMLInputElement).type,
            label,
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        });
        return map;
      },
      args: [elementTypes ?? null, containerSelector ?? null],
    });
    const elements = (res?.result as unknown[]) ?? [];
    return { count: elements.length, elements };
  },
};

export const clearAnnotations: ToolDefinition = {
  name: 'clear_annotations',
  description: 'Remove the numbered [n] annotation badges from the active tab or a specific iframe.',
  parameters: {
    type: 'object',
    properties: {
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabIdVal = await resolveTabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabIdVal, String(args.frame_selector));
      if (resolved === undefined) return { error: `Iframe not found for selector: ${args.frame_selector}` };
      targetFrameId = resolved;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tabIdVal, frameIds: [targetFrameId] },
      func: () => document.querySelectorAll('[data-bm-badge]').forEach((b) => b.remove()),
    });
    return { cleared: true };
  },
};

export const annotationTools = [annotatePage, clearAnnotations];
