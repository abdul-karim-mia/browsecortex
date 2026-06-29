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
  pages: z.number().positive().optional(),
  container_selector: z.string().optional(),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});

const scrollToTextSchema = z.object({
  text: z.string(),
  nth: z.number().int().min(1).default(1),
  tab_id: z.number().int().optional(),
  frame_selector: z.string().optional(),
});


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
      func: (annId: number | null, selector: string | null, text: string | null, xpath: string | null) => {
        // Inline finder — injected functions cannot reference outer-scope helpers.
        const el = (() => {
          // Priority 1: Annotation ID
          if (annId !== null) {
            interface AnnotationMeta {
              tag: string;
              id: string;
              name: string;
              type: string;
              text: string;
            }
            const w = window as unknown as {
              __bmAnnotations?: Element[];
              __bmAnnotationMeta?: AnnotationMeta[];
            };
            const ref = w.__bmAnnotations?.[annId - 1];
            // Use the live reference only if it's still attached to the document.
            // After a re-render the original node can be detached, in which case
            // clicking it does nothing — fall through to attribute re-resolution.
            if (ref && document.contains(ref)) return ref as HTMLElement;

            const meta = w.__bmAnnotationMeta?.[annId - 1];
            if (meta) {
              if (meta.id) {
                const byId = document.getElementById(meta.id);
                if (byId) return byId as HTMLElement;
              }
              // Score live candidates of the same tag by durable attributes.
              const cands = Array.from(document.querySelectorAll<HTMLElement>(meta.tag || '*'));
              let best: HTMLElement | null = null;
              let bestScore = 0;
              for (const c of cands) {
                let score = 0;
                if (meta.name && c.getAttribute('name') === meta.name) score += 50;
                if (meta.type && (c as HTMLInputElement).type === meta.type) score += 10;
                const t = (
                  c.innerText ||
                  (c as HTMLInputElement).value ||
                  c.getAttribute('aria-label') ||
                  (c as HTMLInputElement).placeholder ||
                  ''
                ).trim();
                if (meta.text && t === meta.text) score += 40;
                else if (meta.text && t.includes(meta.text)) score += 20;
                if (score > bestScore) {
                  bestScore = score;
                  best = c;
                }
              }
              // Require a meaningful match (name, exact text, or strong partial).
              if (bestScore >= 40) return best;
            }
          }
          // Priority 2: CSS Selector
          if (selector) {
            const e = document.querySelector(selector);
            if (e) return e as HTMLElement;
          }
          // Priority 3: Visible text
          if (text) {
            const cands = Array.from(
              document.querySelectorAll<HTMLElement>(
                'a,button,input,[role="button"],summary,label',
              ),
            );
            const exact = cands.find((e) => (e.innerText || e.getAttribute('value') || '').trim() === text);
            if (exact) return exact;
            const partial = cands.find((e) =>
              (e.innerText || e.getAttribute('value') || '')
                .toLowerCase()
                .includes((text || '').toLowerCase()),
            );
            if (partial) return partial;
          }
          // Priority 4: XPath (fallback)
          if (xpath) {
            try {
              const result = document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
              );
              if (result.singleNodeValue instanceof HTMLElement) {
                return result.singleNodeValue;
              }
            } catch {
              // Invalid XPath, continue
            }
          }
          return null;
        })();
        if (!el) return { found: false };
        const target = el as HTMLElement;

        // Bring the element into view before interacting (browser-use / AIPex do
        // this first — coordinates and pointer hit-testing are meaningless for an
        // off-screen element).
        try {
          target.scrollIntoView({ block: 'center', inline: 'center' });
        } catch {
          /* scrollIntoView can throw in detached nodes — ignore */
        }

        // Detect whether the element is actually hittable, so we can report when a
        // click likely landed on an overlay instead of the intended target.
        let obscured = false;
        try {
          const rect = target.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const topEl = document.elementFromPoint(cx, cy);
            obscured = !!topEl && topEl !== target && !target.contains(topEl) && !topEl.contains(target);
          }
        } catch {
          /* ignore hit-test failures */
        }

        // Dispatch a full pointer/mouse sequence so widgets that listen for
        // mousedown/mouseup (not just click) react — then fire the canonical
        // .click() for navigation/submit semantics.
        const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit;
        try {
          target.dispatchEvent(new PointerEvent('pointerdown', opts));
        } catch {
          /* PointerEvent unsupported — fall through to mouse events */
        }
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        target.dispatchEvent(new MouseEvent('mouseup', opts));
        target.click();

        return {
          found: true,
          tag: target.tagName,
          text: target.innerText?.slice(0, 80),
          ...(obscured ? { warning: 'Element may be covered by another element (overlay); click may not have reached it.' } : {}),
        };
      },
      args: [annotationId, validated.selector ?? null, validated.text ?? null, validated.xpath ?? null],
    });
      const data = res?.result as { found: boolean; tag?: string; text?: string } | undefined;
      if (!data?.found)
        return { error: 'Element not found (annotation may be stale — re-run annotate_page).' };
      return { clicked: true, tag: data.tag, text: data.text };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
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

          try {
            el.scrollIntoView({ block: 'center', inline: 'center' });
          } catch {
            /* ignore */
          }
          el.focus();

          // contenteditable editors: insert via execCommand, falling back to textContent.
          const isContentEditable = el.isContentEditable || !!el.closest('[contenteditable="true"]');
          if (isContentEditable && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            if (sel) {
              sel.removeAllRanges();
              sel.addRange(range);
            }
            const ok = document.execCommand('insertText', false, value);
            if (!ok) {
              el.textContent = value;
              el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            }
            return { found: true, method: 'contenteditable' };
          }

          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            // REACT/VUE-COMPATIBLE VALUE SETTING (browser-use technique):
            // Frameworks override the element's `value` property with their own
            // setter to track changes. Assigning `el.value = x` directly bypasses
            // their setter, so the framework never sees the update. Calling the
            // *native* prototype setter writes the value in a way the framework's
            // input listener detects.
            const proto =
              el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
            if (descriptor && descriptor.set) {
              descriptor.set.call(el, value);
            } else {
              el.value = value;
            }

            // Fire the events frameworks listen for, in realistic order.
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));

            const ok = (el as HTMLInputElement | HTMLTextAreaElement).value === value;
            return { found: true, method: 'native-setter', verified: ok };
          }

          return { found: false, reason: 'not-fillable' };
        },
        args: [validated.selector, validated.value],
      });
      const data = res?.result as
        | { found: boolean; reason?: string; method?: string; verified?: boolean }
        | undefined;
      if (!data?.found) {
        return {
          error:
            data?.reason === 'not-fillable'
              ? 'Target is not an input, textarea, or contenteditable element.'
              : 'Input not found.',
        };
      }
      return {
        filled: true,
        method: data.method,
        ...(data.verified === false
          ? { warning: 'Value was set but did not read back as expected (the field may reformat or reject it).' }
          : {}),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        return { error: `Validation error: ${messages}` };
      }
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

export const scrollPage: ToolDefinition = {
  name: 'scroll_page',
  description:
    'Scroll the page or a scrollable container. Modes (in priority order): ' +
    'selector (scroll an element into view), y_percent (jump to 0-100% of the document/container), ' +
    'pages (scroll N viewport-heights in `direction`), or a plain direction (up/down/top/bottom). ' +
    'Use container_selector to scroll inside a specific scrollable element instead of the window.',
  parameters: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] },
      selector: { type: 'string', description: 'Scroll this element into view.' },
      y_percent: { type: 'number', description: 'Scroll to this vertical percentage (0=top, 100=bottom).' },
      pages: { type: 'number', description: 'Number of viewport-heights to scroll in `direction` (e.g. 0.5, 1, 2).' },
      container_selector: {
        type: 'string',
        description: 'CSS selector of a scrollable container to scroll within (defaults to the whole window).',
      },
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
        func: (
          direction: string,
          selector: string | null,
          yPercent: number | null,
          pages: number | null,
          containerSelector: string | null,
        ) => {
          // Mode 1: scroll a specific element into view.
          if (selector) {
            const el = document.querySelector(selector);
            if (!el) return { ok: false, reason: 'selector-not-found' };
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { ok: true, mode: 'into-view', selector };
          }

          // Resolve the scroll target: a container element, or the window/document.
          const container = containerSelector ? document.querySelector(containerSelector) : null;
          if (containerSelector && !container) {
            return { ok: false, reason: 'container-not-found' };
          }

          const scrollEl =
            (container as HTMLElement | null) ??
            (document.scrollingElement as HTMLElement | null) ??
            document.documentElement;
          const viewportH = container
            ? (container as HTMLElement).clientHeight
            : window.innerHeight;
          const maxTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);

          // Mode 2: jump to a vertical percentage.
          if (yPercent !== null) {
            const top = (Math.min(100, Math.max(0, yPercent)) / 100) * maxTop;
            scrollEl.scrollTo({ top, behavior: 'smooth' });
            return { ok: true, mode: 'percent', yPercent, scrollTop: Math.round(top) };
          }

          // Mode 3: scroll by N viewport-heights in a direction.
          if (pages !== null) {
            const delta = viewportH * pages * (direction === 'up' ? -1 : 1);
            scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
            return { ok: true, mode: 'pages', pages, direction: direction === 'up' ? 'up' : 'down' };
          }

          // Mode 4: plain direction.
          if (direction === 'top') scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
          else if (direction === 'bottom') scrollEl.scrollTo({ top: maxTop, behavior: 'smooth' });
          else if (direction === 'up') scrollEl.scrollBy({ top: -viewportH * 0.8, behavior: 'smooth' });
          else scrollEl.scrollBy({ top: viewportH * 0.8, behavior: 'smooth' });
          return { ok: true, mode: 'direction', direction, scrollTop: Math.round(scrollEl.scrollTop) };
        },
        args: [
          validated.direction ?? 'down',
          validated.selector ?? null,
          validated.y_percent ?? null,
          validated.pages ?? null,
          validated.container_selector ?? null,
        ],
      });
      const data = res?.result as { ok: boolean; reason?: string } | undefined;
      if (!data?.ok) {
        const reason =
          data?.reason === 'container-not-found'
            ? `Scroll container not found: ${validated.container_selector}`
            : data?.reason === 'selector-not-found'
              ? `Scroll target not found: ${validated.selector}`
              : 'Scroll target not found.';
        return { error: reason };
      }
      return data;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
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
        const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
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

export const scrollToText: ToolDefinition = {
  name: 'scroll_to_text',
  description:
    'Find text on the page and scroll it into view. Useful for discovering content or navigating to specific sections.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to search for on the page.' },
      nth: {
        type: 'number',
        description: 'Which occurrence to scroll to (1-indexed, default is 1 for first occurrence).',
      },
      tab_id: { type: 'number' },
      frame_selector: { type: 'string', description: 'Optional CSS selector of the iframe to search within.' },
    },
    required: ['text'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'page_interact',
  async execute(args, ctx) {
    try {
      const validated = scrollToTextSchema.parse(args);
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
        func: (searchText: string, occurrence: number) => {
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
          );

          let node: Node | null;
          let count = 0;

          while ((node = walker.nextNode())) {
            if (node.textContent && node.textContent.includes(searchText)) {
              count++;
              if (count === occurrence) {
                const parent = node.parentElement;
                if (parent) {
                  parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  return {
                    found: true,
                    text: node.textContent.slice(0, 200),
                    position: 'scrolled',
                    occurrence,
                  };
                }
              }
            }
          }

          return {
            found: false,
            message:
              count === 0
                ? `Text "${searchText}" not found on page`
                : `Text found ${count} time(s), but requested occurrence #${occurrence} does not exist`,
          };
        },
        args: [validated.text, validated.nth],
      });

      return (res?.result as Record<string, unknown>) ?? { found: false, error: 'Script failed' };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        return { error: `Validation error: ${messages}` };
      }
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

export const interactionTools = [clickElement, fillInput, scrollPage, submitForm, findTextOnPage, scrollToText];
