/**
 * Page interaction tools (PLAN §11). All DOM access via programmatic injection.
 * Elements are targeted by CSS selector or visible text.
 */
import type { ToolDefinition } from '../types';

async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

export const clickElement: ToolDefinition = {
  name: 'click_element',
  description:
    'Click an element by annotation_id (from annotate_page), CSS selector, or visible text. ' +
    'Prefer annotation_id on complex pages.',
  parameters: {
    type: 'object',
    properties: {
      annotation_id: { type: 'number', description: 'The [n] id from a prior annotate_page call.' },
      selector: { type: 'string', description: 'CSS selector of the element.' },
      text: { type: 'string', description: 'Visible text of the element (alternative to selector).' },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const annotationId =
      typeof args.annotation_id === 'number' ? args.annotation_id : null;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (annId: number | null, selector: string | null, text: string | null) => {
        // Inline finder — injected functions cannot reference outer-scope helpers.
        const el = (() => {
          if (annId !== null) {
            const w = window as unknown as { __bmAnnotations?: Element[] };
            const ref = w.__bmAnnotations?.[annId - 1];
            return (ref as HTMLElement) ?? null;
          }
          if (selector) {
            const e = document.querySelector(selector);
            if (e) return e as HTMLElement;
          }
          if (text) {
            const cands = Array.from(
              document.querySelectorAll<HTMLElement>('a,button,input,[role="button"],summary,label'),
            );
            return (
              cands.find((e) => (e.innerText || e.getAttribute('value') || '').trim() === text) ||
              cands.find((e) =>
                (e.innerText || e.getAttribute('value') || '')
                  .toLowerCase()
                  .includes((text || '').toLowerCase()),
              ) ||
              null
            );
          }
          return null;
        })();
        if (!el) return { found: false };
        (el as HTMLElement).click();
        return { found: true, tag: el.tagName, text: (el as HTMLElement).innerText?.slice(0, 80) };
      },
      args: [annotationId, (args.selector as string) ?? null, (args.text as string) ?? null],
    });
    const data = res?.result as { found: boolean; tag?: string; text?: string } | undefined;
    if (!data?.found) return { error: 'Element not found (annotation may be stale — re-run annotate_page).' };
    return { clicked: true, tag: data.tag, text: data.text };
  },
};

export const fillInput: ToolDefinition = {
  name: 'fill_input',
  description: 'Set the value of an input or textarea identified by CSS selector.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      value: { type: 'string' },
      tab_id: { type: 'number' },
    },
    required: ['selector', 'value'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selector: string, value: string) => {
        const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!el) return { found: false };
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { found: true };
      },
      args: [String(args.selector), String(args.value)],
    });
    const data = res?.result as { found: boolean } | undefined;
    if (!data?.found) return { error: 'Input not found.' };
    return { filled: true };
  },
};

export const scrollPage: ToolDefinition = {
  name: 'scroll_page',
  description: 'Scroll the page by a direction (up/down/top/bottom) or to a selector.',
  parameters: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] },
      selector: { type: 'string', description: 'Scroll this element into view instead.' },
      tab_id: { type: 'number' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (direction: string | null, selector: string | null) => {
        if (selector) {
          const el = document.querySelector(selector);
          if (!el) return { ok: false };
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { ok: true };
        }
        const h = window.innerHeight;
        if (direction === 'top') window.scrollTo({ top: 0 });
        else if (direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight });
        else if (direction === 'up') window.scrollBy({ top: -h * 0.8 });
        else window.scrollBy({ top: h * 0.8 });
        return { ok: true, scrollY: window.scrollY };
      },
      args: [(args.direction as string) ?? 'down', (args.selector as string) ?? null],
    });
    const data = res?.result as { ok: boolean } | undefined;
    if (!data?.ok) return { error: 'Scroll target not found.' };
    return data;
  },
};

export const submitForm: ToolDefinition = {
  name: 'submit_form',
  description: 'Submit the form matching a CSS selector (or the form containing it).',
  parameters: {
    type: 'object',
    properties: { selector: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['selector'],
  },
  destructive: true,
  timeout: 'page_interact',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selector: string) => {
        const el = document.querySelector(selector);
        const form = (el instanceof HTMLFormElement ? el : el?.closest('form')) as HTMLFormElement | null;
        if (!form) return { found: false };
        form.requestSubmit();
        return { found: true };
      },
      args: [String(args.selector)],
    });
    const data = res?.result as { found: boolean } | undefined;
    if (!data?.found) return { error: 'Form not found.' };
    return { submitted: true };
  },
};

export const findTextOnPage: ToolDefinition = {
  name: 'find_text_on_page',
  description: 'Check whether some text appears on the page and return surrounding context.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' }, tab_id: { type: 'number' } },
    required: ['query'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (query: string) => {
        const body = document.body?.innerText ?? '';
        const idx = body.toLowerCase().indexOf(query.toLowerCase());
        if (idx < 0) return { found: false };
        return { found: true, context: body.slice(Math.max(0, idx - 60), idx + query.length + 60) };
      },
      args: [String(args.query)],
    });
    return (res?.result as Record<string, unknown>) ?? { found: false };
  },
};

export const interactionTools = [
  clickElement,
  fillInput,
  scrollPage,
  submitForm,
  findTextOnPage,
];
