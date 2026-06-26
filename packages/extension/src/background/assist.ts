/**
 * In-page assist bridge (Highlight Toolbar, Inline Assist, Floating Bubble,
 * Email Reply). Content scripts cannot reach AI providers directly — they lack
 * the stored provider config and are subject to page CSP/CORS — so they open a
 * long-lived 'bc-assist' port and the service worker runs the completion here
 * using the same provider resolution + streaming path as the agent loop.
 *
 * One request runs at a time per `id`; tokens stream back as they arrive so the
 * in-page UI can render incrementally. A lightweight `save_memory` action backs
 * the Floating Bubble's "save to knowledge base".
 */
import { streamChat } from '@/providers/chat';
import { resolveAssist } from '@/agent/resolve';
import type { ApiMessage } from '@/providers/chat-types';
import { log } from '@/log';

export const ASSIST_PORT = 'bc-assist';

/** Content script → worker. */
type AssistRequest =
  | { type: 'run'; id: string; system?: string; prompt: string }
  | { type: 'abort'; id: string };

/** Worker → content script. */
export type AssistResponse =
  | { type: 'token'; id: string; content: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string };

async function runCompletion(
  req: Extract<AssistRequest, { type: 'run' }>,
  signal: AbortSignal,
  send: (msg: AssistResponse) => void,
): Promise<void> {
  const resolved = await resolveAssist();
  if ('error' in resolved) {
    send({ type: 'error', id: req.id, message: resolved.error });
    return;
  }
  const messages: ApiMessage[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });

  let emitted = false;
  for await (const ev of streamChat({
    provider: resolved.provider,
    model: resolved.model,
    messages,
    signal,
  })) {
    if (ev.type === 'token' && ev.content) {
      emitted = true;
      send({ type: 'token', id: req.id, content: ev.content });
    }
  }
  if (!emitted) {
    // Some providers only surface text on the final chunk via finishReason; a
    // truly empty reply is still worth signalling so the UI doesn't hang.
    log.debug('[assist] completion produced no tokens');
  }
  send({ type: 'done', id: req.id });
}

/** Register the assist port listener. Call once from the service worker entry. */
export function registerAssistBridge(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== ASSIST_PORT) return;

    // One AbortController per in-flight request id, so a new run or an explicit
    // abort cancels only that request.
    const inflight = new Map<string, AbortController>();
    const send = (msg: AssistResponse) => {
      try {
        port.postMessage(msg);
      } catch {
        // Port closed (tab navigated/closed) — abort everything it owned.
        for (const c of inflight.values()) c.abort();
        inflight.clear();
      }
    };

    port.onMessage.addListener((req: AssistRequest) => {
      if (req.type === 'abort') {
        inflight.get(req.id)?.abort();
        inflight.delete(req.id);
        return;
      }
      if (req.type === 'run') {
        // Replace any prior run with the same id.
        inflight.get(req.id)?.abort();
        const controller = new AbortController();
        inflight.set(req.id, controller);
        runCompletion(req, controller.signal, send)
          .catch((e) => {
            if (controller.signal.aborted) return; // expected on abort
            send({ type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) });
          })
          .finally(() => {
            if (inflight.get(req.id) === controller) inflight.delete(req.id);
          });
      }
    });

    port.onDisconnect.addListener(() => {
      for (const c of inflight.values()) c.abort();
      inflight.clear();
    });
  });
}
