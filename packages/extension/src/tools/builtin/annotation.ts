/**
 * DOM annotation for reliable clicking (PLAN §10).
 *
 * `annotate_page` numbers every interactive element with a visible [n] badge and
 * stashes element references in the isolated-world `window.__bmAnnotations`, then
 * returns a clean structural map. The agent then calls
 * `click_element({ annotation_id: n })` — far more reliable than CSS selectors.
 */
import type { ToolDefinition } from '../types';

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
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const w = window as unknown as { __bmAnnotations?: Element[] };
        // Clear any prior badges.
        document.querySelectorAll('[data-bm-badge]').forEach((b) => b.remove());

        const selector = 'a,button,input,textarea,select,[role="button"],[role="link"],summary';
        const els = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => {
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
    });
    const elements = (res?.result as unknown[]) ?? [];
    return { count: elements.length, elements };
  },
};

export const clearAnnotations: ToolDefinition = {
  name: 'clear_annotations',
  description: 'Remove the numbered [n] annotation badges from the active tab.',
  parameters: { type: 'object', properties: { tab_id: { type: 'number' } } },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.querySelectorAll('[data-bm-badge]').forEach((b) => b.remove()),
    });
    return { cleared: true };
  },
};

export const annotationTools = [annotatePage, clearAnnotations];
