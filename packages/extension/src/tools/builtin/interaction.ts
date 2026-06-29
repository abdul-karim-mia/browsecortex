/**
 * Page interaction tools (PLAN §11). All DOM access via programmatic injection.
 * Elements are targeted by CSS selector or visible text.
 */
import { z } from 'zod';
import type { ToolDefinition } from '../types';

// Zod schemas for parameter validation
const clickElementSchema = z.object({
  annotation_id: z.number().int().positive().optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
  xpath: z.string().optional(),
}).refine(
  (data) => data.annotation_id || data.selector || data.text || data.xpath,
  { message: 'Must provide at least one of: annotation_id, selector, text, or xpath' }
);

const fillInputSchema = z.object({
  selector: z.string(),
  value: z.string(),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});

const scrollPageSchema = z.object({
  direction: z.enum(['up', 'down', 'top', 'bottom']).optional().default('down'),
  selector: z.string().optional(),
  y_percent: z.number().min(0).max(100).optional(),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});

const findTextSchema = z.object({
  text: z.string(),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});

const scrollToTextSchema = z.object({
  text: z.string(),
  nth: z.number().int().min(1).default(1),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});

type ClickElementParams = z.infer<typeof clickElementSchema>;
type FillInputParams = z.infer<typeof fillInputSchema>;
type ScrollPageParams = z.infer<typeof scrollPageSchema>;
type FindTextParams = z.infer<typeof findTextSchema>;
type ScrollToTextParams = z.infer<typeof scrollToTextSchema>;

async function resolveTabId(args: Record<string, unknown>, getActive: () => Promise<number>) {
  const id = args.tab_id;
  if (typeof id === 'number' && Number.isInteger(id)) return id;
  return getActive();
}

export async function findFrameId(tabId: number, frameSelector?: string): Promise<number | undefined> {
  if (!frameSelector) return 0;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: (selector: string) => {
        const el = document.querySelector(selector);
        if (!el || el.tagName !== 'IFRAME') return null;
        const iframe = el as HTMLIFrameElement;
        try {
          return new URL(iframe.src, window.location.href).href;
        } catch {
          return iframe.src;
        }
      },
      args: [frameSelector],
    });

    const iframeUrl = res?.result as string | null;
    if (!iframeUrl) return undefined;

    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames) return undefined;
    const normalize = (u: string) => u.split('#')[0].replace(/\/$/, '');
    const targetNorm = normalize(iframeUrl);
    
    let match = frames.find((f) => normalize(f.url) === targetNorm);
    if (!match) {
      match = frames.find((f) => f.url.includes(targetNorm) || targetNorm.includes(f.url));
    }
    return match?.frameId;
  } catch {
    return undefined;
  }
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
      text: {
        type: 'string',
        description: 'Visible text of the element (alternative to selector).',
      },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe containing the element.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    try {
      const validated = clickElementSchema.parse(args);
      const tabId = await resolveTabId(validated, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (validated.frame_selector) {
        const resolved = await findFrameId(tabId, validated.frame_selector);
        if (resolved === undefined) {
          return { error: `Iframe not found for selector: ${validated.frame_selector}` };
        }
        targetFrameId = resolved;
      }
      const annotationId = validated.annotation_id ?? null;
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [targetFrameId] },
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
              document.querySelectorAll<HTMLElement>(
                'a,button,input,[role="button"],summary,label',
              ),
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
      args: [annotationId, validated.selector ?? null, validated.text ?? null],
    });
      const data = res?.result as { found: boolean; tag?: string; text?: string } | undefined;
      if (!data?.found)
        return { error: 'Element not found (annotation may be stale — re-run annotate_page).' };
      return { clicked: true, tag: data.tag, text: data.text };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return { error: `Validation error: ${messages}` };
      }
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

export const fillInput: ToolDefinition = {
  name: 'fill_input',
  description: 'Set the value of an input, textarea, or contenteditable editor identified by CSS selector.',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      value: { type: 'string' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe containing the input.' },
    },
    required: ['selector', 'value'],
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    try {
      const validated = fillInputSchema.parse(args);
      const tabId = await resolveTabId(validated, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (validated.frame_selector) {
        const resolved = await findFrameId(tabId, validated.frame_selector);
        if (resolved === undefined) {
          return { error: `Iframe not found for selector: ${validated.frame_selector}` };
        }
        targetFrameId = resolved;
      }
      const [res] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [targetFrameId] },
        func: (selector: string, value: string) => {
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) return { found: false };
          el.focus();
          const isContentEditable = el.isContentEditable || el.closest('[contenteditable="true"]');
          if (isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            try {
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.select();
                document.execCommand('selectAll', false);
                document.execCommand('insertText', false, value);
                if (el.value !== value) {
                  el.value = value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } else {
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                if (sel) {
                  sel.removeAllRanges();
                  sel.addRange(range);
                }
                document.execCommand('insertText', false, value);
              }
              return { found: true };
            } catch {
              // Fallback if execCommand fails
            }
          }
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { found: true };
          }
          return { found: true };
        },
        args: [validated.selector, validated.value],
      });
      const data = res?.result as { found: boolean } | undefined;
      if (!data?.found) return { error: 'Input not found.' };
      return { filled: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return { error: `Validation error: ${messages}` };
      }
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
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
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe to scroll.' },
    },
  },
  destructive: false,
  timeout: 'page_interact',
  async execute(args, ctx) {
    try {
      const validated = scrollPageSchema.parse(args);
      const tabId = await resolveTabId(validated, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (validated.frame_selector) {
        const resolved = await findFrameId(tabId, validated.frame_selector);
        if (resolved === undefined) {
          return { error: `Iframe not found for selector: ${validated.frame_selector}` };
        }
        targetFrameId = resolved;
      }
      const [res] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [targetFrameId] },
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
        args: [validated.direction ?? 'down', validated.selector ?? null],
      });
      const data = res?.result as { ok: boolean } | undefined;
      if (!data?.ok) return { error: 'Scroll target not found.' };
      return data;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return { error: `Validation error: ${messages}` };
      }
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

const submitFormSchema = z.object({
  selector: z.string(),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});

export const submitForm: ToolDefinition = {
  name: 'submit_form',
  description: 'Submit the form matching a CSS selector (or the form containing it).',
  parameters: {
    type: 'object',
    properties: {
      selector: { type: 'string' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe containing the form.' },
    },
    required: ['selector'],
  },
  destructive: true,
  timeout: 'page_interact',
  async execute(args, ctx) {
    try {
      const validated = submitFormSchema.parse(args);
      const tabId = await resolveTabId(validated, ctx.getActiveTabId);
      let targetFrameId = 0;
      if (validated.frame_selector) {
        const resolved = await findFrameId(tabId, validated.frame_selector);
        if (resolved === undefined) {
          return { error: `Iframe not found for selector: ${validated.frame_selector}` };
        }
        targetFrameId = resolved;
      }
      const [res] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [targetFrameId] },
        func: (selector: string) => {
          const el = document.querySelector(selector);
          const form = (
            el instanceof HTMLFormElement ? el : el?.closest('form')
          ) as HTMLFormElement | null;
          if (!form) return { found: false };
          form.requestSubmit();
          return { found: true };
        },
        args: [validated.selector],
      });
      const data = res?.result as { found: boolean } | undefined;
      if (!data?.found) return { error: 'Form not found.' };
      return { submitted: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return { error: `Validation error: ${messages}` };
      }
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

export const findTextOnPage: ToolDefinition = {
  name: 'find_text_on_page',
  description: 'Check whether some text appears on the page and return surrounding context.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe to search within.' },
    },
    required: ['query'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_read',
  async execute(args, ctx) {
    const tabId = await resolveTabId(args, ctx.getActiveTabId);
    let targetFrameId = 0;
    if (args.frame_selector) {
      const resolved = await findFrameId(tabId, String(args.frame_selector));
      if (resolved === undefined) {
        return { error: `Iframe not found for selector: ${args.frame_selector}` };
      }
      targetFrameId = resolved;
    }
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [targetFrameId] },
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

export const interactionTools = [clickElement, fillInput, scrollPage, submitForm, findTextOnPage];
