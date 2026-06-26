/**
 * Quick AI Email Reply — multi-provider webmail integration. When a thread is
 * open it reads the full thread context, drafts a tailored reply, and drops it
 * into the compose box (falling back to Copy if no compose box is found).
 *
 * Providers and their selectors live in ./email-providers. Gmail gets a native
 * in-thread button; every other provider gets a floating "AI Reply" pill, since
 * a stable toolbar anchor can't be guaranteed across webmails we can't test.
 * Everything is best-effort and degrades gracefully — a missed selector means
 * the button reads less context or copies instead of inserts, never a thrown
 * error on the host page.
 */
import { root, el, button as mkButton, toast } from './ui';
import { openResultPanel } from './panel';
import { BRAND_SVG } from './icon';
import { detectProvider, type MailProvider } from './email-providers';

const SYSTEM =
  'You are an email assistant. Read the email thread and draft a clear, courteous reply on ' +
  "behalf of the recipient. Match the thread's language and tone. Output only the reply body — " +
  'no subject line, no "Dear/Sincerely" placeholders unless appropriate, no markdown.';

/** Documents to search: the top document plus any same-origin iframes (webmails
 * like Proton/Zoho/Mailfence render message + compose inside iframes). */
function searchDocs(): Document[] {
  const docs: Document[] = [document];
  for (const f of Array.from(document.querySelectorAll('iframe'))) {
    try {
      const d = (f as HTMLIFrameElement).contentDocument;
      if (d && d !== document) docs.push(d);
    } catch {
      /* cross-origin iframe — skip */
    }
  }
  return docs;
}

function queryAllDeep(selectors: string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const doc of searchDocs()) {
    for (const sel of selectors) {
      try {
        doc.querySelectorAll<HTMLElement>(sel).forEach((n) => out.push(n));
      } catch {
        /* invalid selector for this doc — ignore */
      }
    }
  }
  return out;
}

function visible(n: HTMLElement): boolean {
  return n.offsetParent !== null || n.getClientRects().length > 0;
}

/** Concatenate the visible message bodies of the open thread. */
function readThread(provider: MailProvider): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const n of queryAllDeep(provider.body)) {
    if (!visible(n)) continue;
    const t = n.innerText.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      parts.push(t);
    }
  }
  // Fallback: grab the largest readable text block on the page.
  if (parts.length === 0) {
    const main =
      document.querySelector<HTMLElement>('[role="main"], main, article') ?? document.body;
    const t = main?.innerText?.trim() ?? '';
    if (t) parts.push(t);
  }
  return parts.join('\n\n---\n\n').slice(0, 12000);
}

/** Find the open compose/reply editable, if any. */
function composeBox(provider: MailProvider): HTMLElement | HTMLTextAreaElement | null {
  const candidates = [
    ...queryAllDeep(provider.compose),
    ...queryAllDeep(['[contenteditable="true"]', '[role="textbox"][contenteditable]', 'textarea']),
  ].filter(visible);
  return candidates[candidates.length - 1] ?? null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
}

function insertReply(provider: MailProvider, text: string): boolean {
  const box = composeBox(provider);
  if (!box) return false;
  box.focus();
  if (box instanceof HTMLTextAreaElement) {
    box.value = `${text}\n\n${box.value}`;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  const html = text
    .split('\n')
    .map((line) => (line ? escapeHtml(line) : '<br>'))
    .join('<br>');
  // Prepend the draft above any existing quoted content.
  box.innerHTML = `${html}<br><br>${box.innerHTML}`;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function draftReply(provider: MailProvider, rect?: DOMRect): void {
  const thread = readThread(provider);
  if (!thread) {
    toast('Open an email to draft a reply', 'error');
    return;
  }
  openResultPanel({
    title: 'AI Reply',
    system: SYSTEM,
    prompt: `Email thread:\n\n${thread}\n\nDraft a reply.`,
    rect,
    onInsert: (text) => {
      if (!insertReply(provider, text)) {
        navigator.clipboard?.writeText(text);
        toast('No reply box open — copied to clipboard instead');
      }
    },
  });
}

/** A button face: brand icon + "AI Reply" label. */
function buttonFace(): string {
  return `<span style="display:inline-flex;width:15px;height:15px;vertical-align:middle;">${BRAND_SVG}</span><span style="vertical-align:middle;">AI Reply</span>`;
}

const MARK = 'data-bc-aireply';

/** Native inline injection (Gmail): drop the button into each action row. */
function injectInline(provider: MailProvider): boolean {
  if (!provider.anchors) return false;
  let injected = false;
  for (const row of queryAllDeep(provider.anchors)) {
    if (row.hasAttribute(MARK) || !visible(row)) continue;
    row.setAttribute(MARK, '1');
    const btn = mkButton('', () => draftReply(provider));
    btn.innerHTML = buttonFace();
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;margin:6px 8px;color:#fff;' +
      'background:linear-gradient(135deg,#4f7df3,#2e5ce0);border-radius:16px;' +
      'padding:6px 12px;font-size:13px;cursor:pointer;border:0;';
    const host = el('span', {});
    host.appendChild(btn);
    row.appendChild(host);
    injected = true;
  }
  return injected;
}

/** Floating pill fallback for providers without a reliable toolbar anchor. */
function ensureFloatingPill(provider: MailProvider): void {
  const r = root();
  if (r.querySelector('.bc-mail-pill')) return;
  const btn = mkButton('', () => draftReply(provider));
  btn.className = 'bc-mail-pill';
  btn.innerHTML = buttonFace();
  btn.title = `Draft an AI reply (${provider.name})`;
  btn.style.cssText =
    'position:fixed;z-index:2147483646;right:18px;bottom:74px;display:inline-flex;' +
    'align-items:center;gap:6px;color:#fff;background:linear-gradient(135deg,#4f7df3,#2e5ce0);' +
    'border-radius:18px;padding:8px 14px;font-size:13px;cursor:pointer;border:0;' +
    'box-shadow:0 6px 20px rgba(80,60,255,.4);';
  r.appendChild(btn);
}

export function initEmail(): void {
  const provider = detectProvider(location.hostname);
  if (!provider) return;

  const apply = () => {
    try {
      const injected = injectInline(provider);
      if (!injected && !provider.anchors) ensureFloatingPill(provider);
    } catch {
      /* never break the host page */
    }
  };

  // Webmails are SPAs that swap thread content without navigation — observe and
  // (re)inject. Throttled so heavy DOM churn stays cheap.
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      apply();
    }, 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  apply();
}
