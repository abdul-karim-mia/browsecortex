/**
 * ask_external_ai (B7, PLAN §16). Opens a public AI chat site (ChatGPT, Claude,
 * Gemini, Perplexity), submits a prompt, waits for the reply to stabilize, and
 * returns the text. This is EXPERIMENTAL and inherently fragile — it depends on
 * each site's DOM, requires the user to be logged in, and is gated behind a
 * setting. Selectors live in `@/adapters`.
 */
import type { ToolDefinition, ToolResult } from '../types';
import { EXTERNAL_AI_ADAPTERS, getAdapter } from '@/adapters';
import { Storage } from '@/storage';

/** Runs in the page: optionally attach an image, type the prompt, submit, and
 * read back the reply text. */
function driveExternalChat(
  prompt: string,
  inputSelectors: string[],
  sendSelectors: string[],
  responseSelectors: string[],
  pollMs: number,
  fileInputSelectors: string[],
  image: { b64: string; mime: string; name: string } | null,
  imageMethod: 'file' | 'paste',
  incognito: boolean,
  serviceId: string,
): Promise<{ ok: true; text: string; imageAttached?: boolean } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const find = (selectors: string[]): HTMLElement | null => {
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    };

    // Is the element a real, visible composer (not a hidden/sidebar field)?
    const isUsableInput = (el: HTMLElement): boolean => {
      if (el.closest('nav, aside, [role="navigation"]')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 12) return false;
      const st = getComputedStyle(el);
      return st.visibility !== 'hidden' && st.display !== 'none';
    };

    // Among all candidate inputs, pick the largest visible one — that's the main
    // message composer, not a sidebar search box.
    const findInput = (): HTMLElement | null => {
      const candidates: HTMLElement[] = [];
      for (const sel of inputSelectors) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => candidates.push(el));
      }
      const usable = candidates.filter(isUsableInput);
      const pool = usable.length ? usable : candidates;
      pool.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      });
      return pool[0] ?? null;
    };

    (async () => {
      if (incognito) {
        if (serviceId === 'claude') {
          const hasIncognitoLabel = document.body.innerText.includes('Incognito chat');
          if (!hasIncognitoLabel) {
            const ghostBtn = find(['button[aria-label*="incognito" i]', 'button[aria-label*="Incognito"]']);
            if (ghostBtn) {
              ghostBtn.click();
              await sleep(1500);
            } else {
              window.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: 'I',
                  code: 'KeyI',
                  ctrlKey: true,
                  shiftKey: true,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              await sleep(1500);
            }
          }
        } else if (serviceId === 'gemini') {
          const tempBtn = find(['button[aria-label*="Temporary chat"]', 'button[aria-label*="temporary chat" i]']);
          if (tempBtn) {
            tempBtn.click();
            await sleep(1500);
          }
        } else if (serviceId === 'perplexity') {
          const isIncognito = document.body.innerText.includes('Incognito');
          if (!isIncognito) {
            const incognitoBtn = find([
              'button[aria-label="Use incognito: create anonymous sessions that aren\'t saved to your history and expire after 24 hours"]',
              'button[aria-label*="Use incognito" i]',
              'button[aria-label*="incognito" i]',
            ]);
            if (incognitoBtn) {
              incognitoBtn.click();
              await sleep(1500);
            } else {
              window.dispatchEvent(
                new KeyboardEvent('keydown', {
                  key: ';',
                  code: 'Semicolon',
                  ctrlKey: true,
                  bubbles: true,
                  cancelable: true,
                }),
              );
              await sleep(1500);
            }
          }
        }
      }

      const input = findInput();
      if (!input) {
        resolve({ ok: false, reason: 'input-not-found' });
        return;
      }
      // Anchor extraction to the input's main column so the sidebar/history is
      // excluded from both the observer and the response scan.
      const scope: HTMLElement = (input.closest('main, [role="main"]') as HTMLElement) ?? document.body;

      // Best-effort image attach. `file` feeds a hidden <input type=file>;
      // `paste` dispatches a paste event onto the composer (more universal — it
      // works on sites like Gemini whose uploader isn't a plain file input).
      let imageAttached = false;
      if (image) {
        try {
          const bin = atob(image.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const file = new File([bytes], image.name, { type: image.mime });

          const fileInput = find(fileInputSelectors) as HTMLInputElement | null;
          // Use the file input only when the adapter prefers it AND one exists;
          // otherwise paste (the adapter asked for it, or there's no file input).
          if (imageMethod === 'file' && fileInput) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            imageAttached = true;
          } else {
            input.focus();
            const dt = new DataTransfer();
            dt.items.add(file);
            input.dispatchEvent(
              new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
            );
            imageAttached = true;
          }
          if (imageAttached) await sleep(3000); // let the site upload + preview
        } catch {
          /* attach failed — proceed with text only */
        }
      }

      // Type the prompt. Textareas take a native value-setter; rich editors
      // (ProseMirror/Lexical, as Claude/Perplexity use) ignore textContent and
      // need execCommand('insertText') to update their internal model.
      input.focus();
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) {
          setter.call(input, prompt);
        } else {
          input.value = prompt;
        }
        // Dispatch key, input, and change events to trigger all framework listeners
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      } else {
        const selection = window.getSelection();
        selection?.selectAllChildren(input);
        const inserted = document.execCommand('insertText', false, prompt);
        // Fallback if execCommand is a no-op for this editor.
        if (!inserted) {
          input.textContent = prompt;
        }
        // Dispatch events to notify editor framework without duplicating input
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }
      await sleep(400);

      // Submit, verifying success by watching the input clear (every site wipes
      // the box once a message is sent). Try strategies in order until one works.
      const promptText = () =>
        input instanceof HTMLTextAreaElement
          ? input.value.trim()
          : (input.textContent ?? '').trim();
      const pressEnter = () => {
        for (const type of ['keydown', 'keypress', 'keyup']) {
          input.dispatchEvent(
            new KeyboardEvent(type, {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      };
      // Find an enabled send button: try the adapter's selectors first, then any
      // non-disabled button in the column whose label looks like send/submit.
      const findSendButton = (): HTMLButtonElement | null => {
        for (const sel of sendSelectors) {
          const b = scope.querySelector<HTMLButtonElement>(sel);
          if (b && !b.disabled) return b;
        }
        const buttons = Array.from(scope.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
        const rx = /send|submit|ask/i;
        for (const b of buttons.reverse()) {
          const label = (b.getAttribute('aria-label') || b.title || b.textContent || '').trim();
          if (rx.test(label)) return b;
        }
        return null;
      };

      const sent = async (): Promise<boolean> => {
        const before = promptText();
        // 1) Click a send button (re-query — it often enables only after input).
        const btn = findSendButton();
        if (btn) {
          btn.click();
          await sleep(600);
          if (promptText() !== before || before === '') return true;
        }
        // 2) Enter key sequence.
        pressEnter();
        await sleep(600);
        if (promptText() !== before || before === '') return true;
        // 3) Submit the surrounding form.
        const form = input.closest('form');
        if (form) {
          form.requestSubmit?.();
          await sleep(600);
          if (promptText() !== before || before === '') return true;
        }
        return false;
      };

      // If an image is attached it uploads asynchronously, and most sites keep
      // the send control disabled until it finishes. Wait for the button to
      // re-enable before submitting, so we don't send before the image is ready.
      if (imageAttached) {
        const uploadDeadline = Date.now() + 20_000;
        while (Date.now() < uploadDeadline && !findSendButton()) {
          await sleep(500);
        }
        await sleep(1500); // small settle once the control is ready
      }

      // Attempt the send, but DON'T bail if it isn't confirmed — rich editors
      // (ProseMirror/Lexical) clear asynchronously, so the clear-check can
      // false-negative even when the message actually went through. We proceed
      // to watch for a reply and only report a send failure at the very end.
      const beforeSend = promptText();
      const sendDetected = await sent();

      // Watch the page with a MutationObserver as the answer streams in. This
      // is selector-resilient: we record which elements actually change, so even
      // if the site-specific response selector is wrong we can fall back to the
      // most-changed text block. Completion is detected when the extracted text
      // stops growing (robust against unrelated background mutations).
      const FALLBACK = ['[class*="markdown"]', '[class*="prose"]', '[class*="message"]'];
      const touched = new Set<HTMLElement>();
      let sawMutation = false;
      // Observe the whole document — SPAs like Claude replace the conversation
      // subtree on send, so a cached scope node goes stale and stops emitting.
      const observer = new MutationObserver((records) => {
        sawMutation = true;
        for (const rec of records) {
          const node: Node = rec.target;
          const el = node instanceof HTMLElement ? node : node.parentElement;
          if (el) touched.add(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      // Re-resolve the conversation column on every read (the node can be
      // swapped out by a re-render), so the sidebar stays excluded without
      // caching a stale element.
      const liveScope = (): HTMLElement =>
        (document.querySelector('main, [role="main"]') as HTMLElement) ?? document.body;

      // The site echoes the user's prompt as a message bubble; never mistake
      // that for the reply. Treat text that's just the prompt as "not the answer".
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      const promptNorm = norm(prompt);
      const isEcho = (text: string): boolean => {
        const n = norm(text);
        return n === promptNorm || (promptNorm.length > 0 && n.length <= promptNorm.length + 15 && n.includes(promptNorm));
      };

      const readResponse = (): string => {
        const root = liveScope();
        // Prefer explicit response selectors, scanning newest-first and skipping
        // the prompt echo, scoped to the conversation column (no sidebar).
        for (const sel of [...responseSelectors, ...FALLBACK]) {
          const found = root.querySelectorAll<HTMLElement>(sel);
          for (let i = found.length - 1; i >= 0; i--) {
            const el = found[i];
            // Only read from elements that have actually been mutated (or their descendants/ancestors)
            // to avoid returning static pre-existing content on page load.
            const wasMutated = Array.from(touched).some((t) => t.contains(el) || el.contains(t));
            if (!wasMutated) continue;

            const text = (el.innerText ?? '').trim();
            if (text && !isEcho(text)) return text;
          }
        }
        // Fallback: among the still-attached elements the observer saw change
        // (inside the live column), the one with the most non-echo text.
        let best = '';
        for (const el of touched) {
          if (!root.contains(el)) continue;
          const text = (el.innerText ?? '').trim();
          if (text && !isEcho(text) && text.length > best.length) best = text;
        }
        return best;
      };

      // Treat the reply as complete once its text has been stable for a beat.
      const start = Date.now();
      let lastText = '';
      let stableSince = Date.now();
      const finish = () => {
        observer.disconnect();
        if (lastText) resolve({ ok: true, text: lastText, imageAttached });
        // No reply captured. If the page never reacted at all (no mutations,
        // send not confirmed), the submit genuinely failed; otherwise something
        // happened but we couldn't read the answer — a plain timeout.
        else if (!sendDetected && !sawMutation && beforeSend !== '')
          resolve({ ok: false, reason: 'could-not-send' });
        else resolve({ ok: false, reason: 'no-response' });
      };
      while (Date.now() - start < pollMs) {
        await sleep(400);
        const text = readResponse();
        if (text && text === lastText) {
          if (Date.now() - stableSince > 1800) return finish();
        } else {
          lastText = text;
          stableSince = Date.now();
        }
      }
      finish();
    })().catch((e) => resolve({ ok: false, reason: String(e) }));
  });
}

/** Max image size to forward to the page (base64 inflates ~33%). */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Fetch an image URL (http(s) or data:) into base64 for injection. */
async function fetchImage(
  url: string,
): Promise<{ b64: string; mime: string; name: string } | { error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `Could not fetch image (${res.status}).` };
    const blob = await res.blob();
    if (blob.size > MAX_IMAGE_BYTES) return { error: 'Image too large (max 5MB).' };
    const buf = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const mime = blob.type || 'image/png';
    const ext = mime.split('/')[1] || 'png';
    return { b64: btoa(binary), mime, name: `image.${ext}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const askExternalAi: ToolDefinition = {
  name: 'ask_external_ai',
  description:
    'Ask a public AI chat website (ChatGPT, Claude, Gemini, or Perplexity) a question by ' +
    'driving the page in a tab, and return its reply. The user must already be logged in to ' +
    `that site. Optionally attach an image. Experimental and may fail ` +
    `if the site's layout changed. Available services: ${EXTERNAL_AI_ADAPTERS.map((a) => a.id).join(', ')}.`,
  parameters: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        enum: EXTERNAL_AI_ADAPTERS.map((a) => a.id),
        description: 'Which external AI service to use.',
      },
      prompt: { type: 'string', description: 'The question/prompt to send.' },
      image_url: {
        type: 'string',
        description:
          'Optional image to attach — an http(s) URL or a data: URL. Best-effort; some sites may not accept it.',
      },
      incognito: {
        type: 'boolean',
        description:
          "Use the service's native temporary/incognito chat mode (e.g. temporary chat in ChatGPT/Gemini, incognito mode in Claude/Perplexity) so history is not saved, while remaining logged in.",
      },
      timeout_ms: {
        type: 'number',
        description: 'Max time to wait for a reply (default 60000).',
      },
      close_tab: {
        type: 'boolean',
        description: 'Close the tab when done (default false — leaves it open).',
      },
    },
    required: ['service', 'prompt'],
  },
  destructive: false,
  readsExternal: true,
  timeout: 'inference',
  async execute(args): Promise<ToolResult> {
    const settings = await Storage.settings.get();
    if (!settings.externalAiEnabled) {
      return {
        error:
          'ask_external_ai is disabled. Enable "External AI" in Settings → General to use it.',
      };
    }
    const adapter = getAdapter(String(args.service ?? ''));
    if (!adapter) {
      return { error: `Unknown service. Available: ${EXTERNAL_AI_ADAPTERS.map((a) => a.id).join(', ')}.` };
    }
    const prompt = String(args.prompt ?? '').trim();
    if (!prompt) return { error: 'prompt is required.' };
    const pollMs = Math.min(Math.max(Number(args.timeout_ms) || 60_000, 10_000), 180_000);

    // Resolve an optional image up front so we can fail fast on a bad URL.
    let image: { b64: string; mime: string; name: string } | null = null;
    if (args.image_url) {
      const fetched = await fetchImage(String(args.image_url));
      if ('error' in fetched) return { error: `Image: ${fetched.error}`, service: adapter.id };
      image = fetched;
    }

    // Open the service. Incognito uses the service's native private/temporary chat mode.
    let targetUrl = adapter.url;
    if (args.incognito === true && adapter.id === 'chatgpt') {
      const urlObj = new URL(adapter.url);
      urlObj.searchParams.set('temporary-chat', 'true');
      targetUrl = urlObj.toString();
    }

    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    const tabId = tab.id;
    if (tabId === undefined) return { error: 'Could not open a tab.', service: adapter.id };

    try {
      const loadDeadline = Date.now() + 20_000;
      while (Date.now() < loadDeadline) {
        const t = await chrome.tabs.get(tabId);
        if (t.status === 'complete') break;
        await new Promise((r) => setTimeout(r, 250));
      }
      // Give SPA scripts a moment to mount the input.
      await new Promise((r) => setTimeout(r, 1500));

      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: driveExternalChat,
        args: [
          prompt,
          adapter.inputSelectors,
          adapter.sendSelectors,
          adapter.responseSelectors,
          pollMs,
          adapter.fileInputSelectors,
          image,
          adapter.imageMethod ?? 'file',
          args.incognito === true,
          adapter.id,
        ],
      });
      const result = res?.result as
        | { ok: true; text: string; imageAttached?: boolean }
        | { ok: false; reason: string }
        | undefined;

      if (!result) return { error: 'No result from the page (injection may be blocked).' };
      if (!result.ok) {
        if (result.reason === 'input-not-found') {
          return {
            error: `Could not find the chat input on ${adapter.name}. You may need to log in, or the site layout changed.`,
            needsLogin: true,
            service: adapter.id,
          };
        }
        if (result.reason === 'could-not-send') {
          return {
            error: `Typed the prompt on ${adapter.name} but couldn't submit it (the send control may have changed).`,
            service: adapter.id,
          };
        }
        return {
          error: `${adapter.name} did not return a reply within the timeout (${result.reason}).`,
          service: adapter.id,
        };
      }

      const conversationUrl = (await chrome.tabs.get(tabId).catch(() => null))?.url;
      if (args.close_tab === true) await chrome.tabs.remove(tabId).catch(() => {});
      return {
        service: adapter.id,
        response: result.text,
        conversationUrl,
        // Tell the model if an image was requested but couldn't be attached.
        ...(image ? { imageAttached: result.imageAttached === true } : {}),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), service: adapter.id };
    }
  },
};

export const externalAiTools = [askExternalAi];
