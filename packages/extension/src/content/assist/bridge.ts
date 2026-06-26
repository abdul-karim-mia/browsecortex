/**
 * Content-script side of the 'bc-assist' port. Wraps the long-lived port to the
 * service worker and exposes a small promise/streaming API the in-page features
 * use without caring about message plumbing or reconnection.
 */
import type { AssistResponse } from '@/background/assist';

const PORT = 'bc-assist';

type TokenCb = (chunk: string) => void;

interface Pending {
  onToken?: TokenCb;
  resolve: (full: string) => void;
  reject: (err: Error) => void;
  full: string;
}

let port: chrome.runtime.Port | null = null;
const pending = new Map<string, Pending>();
let seq = 0;

function ensurePort(): chrome.runtime.Port {
  if (port) return port;
  port = chrome.runtime.connect({ name: PORT });
  port.onMessage.addListener((msg: AssistResponse) => {
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'token') {
      p.full += msg.content;
      p.onToken?.(msg.content);
    } else if (msg.type === 'done') {
      pending.delete(msg.id);
      p.resolve(p.full);
    } else if (msg.type === 'error') {
      pending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  });
  port.onDisconnect.addListener(() => {
    port = null;
    // The worker can be torn down between calls; fail anything still in flight
    // so callers aren't left hanging. Fresh calls reconnect lazily.
    const err = new Error('Assistant disconnected. Try again.');
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  });
  return port;
}

export interface RunHandle {
  /** Resolves with the full text once streaming completes. */
  result: Promise<string>;
  /** Cancel the in-flight completion. */
  abort: () => void;
}

/** Stream a completion. `onToken` fires for each chunk as it arrives. */
export function run(opts: { system?: string; prompt: string; onToken?: TokenCb }): RunHandle {
  const id = `r${++seq}`;
  const p = ensurePort();
  const result = new Promise<string>((resolve, reject) => {
    pending.set(id, { onToken: opts.onToken, resolve, reject, full: '' });
  });
  p.postMessage({ type: 'run', id, system: opts.system, prompt: opts.prompt });
  return {
    result,
    abort: () => {
      if (pending.has(id)) {
        pending.delete(id);
        try {
          p.postMessage({ type: 'abort', id });
        } catch {
          /* port already gone */
        }
      }
    },
  };
}
