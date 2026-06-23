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

    (async () => {
      const input = find(inputSelectors);
      if (!input) {
        resolve({ ok: false, reason: 'input-not-found' });
        return;
      }

      // Best-effort image attach: build a File from base64 and feed the site's
      // hidden file input, then let it upload/preview before we submit.
      let imageAttached = false;
      if (image) {
        const fileInput = find(fileInputSelectors) as HTMLInputElement | null;
        if (fileInput) {
          try {
            const bin = atob(image.b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const file = new File([bytes], image.name, { type: image.mime });
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            imageAttached = true;
            await sleep(3000); // let the site upload + show a preview
          } catch {
            /* attach failed — proceed with text only */
          }
        }
      }

      // Type the prompt into a textarea or a contenteditable element.
      input.focus();
      if (input instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        setter?.call(input, prompt);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        input.textContent = prompt;
        input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
      await sleep(300);

      // Submit: click a send button if present, else press Enter.
      const sendBtn = find(sendSelectors) as HTMLButtonElement | null;
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click();
      } else {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
      }

      // Poll the last response block until its text stops growing.
      const start = Date.now();
      let lastText = '';
      let stableSince = Date.now();
      while (Date.now() - start < pollMs) {
        await sleep(600);
        let blocks: NodeListOf<HTMLElement> | HTMLElement[] = [];
        for (const sel of responseSelectors) {
          const found = document.querySelectorAll<HTMLElement>(sel);
          if (found.length) {
            blocks = found;
            break;
          }
        }
        const last = blocks.length ? blocks[blocks.length - 1] : null;
        const text = (last?.innerText ?? '').trim();
        if (text && text === lastText) {
          if (Date.now() - stableSince > 1800) {
            resolve({ ok: true, text, imageAttached });
            return;
          }
        } else {
          lastText = text;
          stableSince = Date.now();
        }
      }
      if (lastText) resolve({ ok: true, text: lastText, imageAttached });
      else resolve({ ok: false, reason: 'no-response' });
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
    `that site (unless using incognito). Optionally attach an image. Experimental and may fail ` +
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
          'Open the site in an incognito window (default false). Requires "Allow in incognito" enabled for the extension.',
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

    // Open the service. Incognito uses a private window (needs the extension to
    // be allowed in incognito); otherwise a normal background tab.
    let tabId: number | undefined;
    if (args.incognito === true) {
      try {
        const win = await chrome.windows.create({
          url: adapter.url,
          incognito: true,
          focused: false,
        });
        tabId = win.tabs?.[0]?.id;
      } catch {
        return {
          error:
            "Couldn't open an incognito window. Enable 'Allow in incognito' for BrowseCortex at chrome://extensions.",
          service: adapter.id,
        };
      }
    } else {
      const tab = await chrome.tabs.create({ url: adapter.url, active: false });
      tabId = tab.id;
    }
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
        return {
          error: `${adapter.name} did not return a reply (${result.reason}).`,
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
