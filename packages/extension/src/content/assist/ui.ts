/**
 * Shared in-page UI primitives for the assist features. Everything renders into
 * a single Shadow DOM root so page CSS can't leak in and our CSS can't leak out.
 * Plain DOM (no Preact) keeps the injected content bundle tiny.
 */

let shadow: ShadowRoot | null = null;

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.bc-pop {
  position: fixed; z-index: 2147483647; max-width: 360px;
  background: #1e1e22; color: #ececf1; border: 1px solid #34343c;
  border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.45);
  font-size: 13px; line-height: 1.45; overflow: hidden;
  animation: bc-fade .12s ease-out;
}
@keyframes bc-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.bc-bar { display: flex; align-items: center; gap: 2px; padding: 4px; }
/* The selection toolbar is a single content-width row — never cap it at the
   shared 360px popover width or the trailing buttons (e.g. Read) get clipped. */
.bc-toolbar { max-width: none; }
.bc-toolbar .bc-bar { flex-wrap: nowrap; }
.bc-btn {
  appearance: none; border: 0; background: transparent; color: #ececf1;
  border-radius: 8px; padding: 6px 9px; font-size: 12.5px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
}
.bc-btn:hover { background: #2f2f37; }
.bc-btn:disabled { opacity: .5; cursor: default; }
.bc-sep { width: 1px; align-self: stretch; background: #34343c; margin: 4px 2px; }
.bc-panel { padding: 12px 14px; max-height: min(320px, 55vh); overflow: auto; }
.bc-panel-head { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-bottom: 1px solid #34343c; }
.bc-title { font-weight: 600; font-size: 12px; letter-spacing: .02em; color: #b9b9c6; }
.bc-x { cursor: pointer; color: #8a8a99; padding: 2px 6px; border-radius: 6px; }
.bc-x:hover { background: #2f2f37; color: #ececf1; }
.bc-out { word-break: break-word; }
.bc-out p { margin: 0 0 8px; }
.bc-out h2, .bc-out h3, .bc-out h4, .bc-out h5 { margin: 10px 0 6px; font-size: 13.5px; font-weight: 600; }
.bc-out ul, .bc-out ol { margin: 0 0 8px; padding-left: 20px; }
.bc-out li { margin: 2px 0; }
.bc-out strong { font-weight: 600; }
.bc-out em { font-style: italic; }
.bc-out a { color: #9b9bff; text-decoration: underline; }
.bc-out code { background: #161619; padding: 1px 5px; border-radius: 5px; font-family: ui-monospace, monospace; font-size: 12px; }
.bc-out pre { background: #161619; padding: 10px; border-radius: 8px; overflow: auto; margin: 0 0 8px; }
.bc-out pre code { background: none; padding: 0; }
.bc-out table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 0 0 8px; }
.bc-out th, .bc-out td { border: 1px solid #34343c; padding: 4px 8px; text-align: left; }
.bc-out > *:last-child { margin-bottom: 0; }
.bc-actions { display: flex; gap: 6px; padding: 9px 12px; border-top: 1px solid #34343c; }
.bc-actions .bc-btn { background: #2f2f37; }
.bc-actions .bc-btn:hover { background: #3a3a44; }
.bc-input {
  width: 100%; background: #161619; color: #ececf1; border: 1px solid #34343c;
  border-radius: 8px; padding: 8px 10px; font-size: 13px; resize: vertical; outline: none;
}
.bc-input:focus { border-color: #6b6bff; }
.bc-menu { display: flex; flex-direction: column; padding: 4px; min-width: 180px; }
.bc-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid #555; border-top-color: #ececf1; border-radius: 50%; animation: bc-rot .7s linear infinite; }
@keyframes bc-rot { to { transform: rotate(360deg); } }
.bc-bubble {
  position: fixed; z-index: 2147483646; right: 18px; bottom: 18px;
  width: 44px; height: 44px; border-radius: 13px; cursor: pointer;
  background: transparent; padding: 0; overflow: visible;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 20px rgba(80,60,255,.45); border: 0; user-select: none;
  transition: transform .12s ease;
}
.bc-bubble .bc-brain { width: 100%; height: 100%; display: block; pointer-events: none; border-radius: 13px; }
.bc-bubble:hover { transform: scale(1.08); }
/* Soft halo that breathes while a summary is generating (no rotation). */
.bc-bubble.working { animation: bc-bubble-halo 1.5s ease-in-out infinite; }
@keyframes bc-bubble-halo {
  0%, 100% { box-shadow: 0 6px 20px rgba(80,60,255,.45), 0 0 0 0 rgba(123,97,255,.5); }
  50% { box-shadow: 0 8px 24px rgba(80,60,255,.6), 0 0 0 10px rgba(123,97,255,0); }
}
/* Each hemisphere scales around its own centre, so the brain "thinks" left↔right. */
.bc-brain .hemi { transform-box: fill-box; transform-origin: center; }
.bc-bubble.working .hemi-l { animation: bc-think 1.5s ease-in-out infinite; }
.bc-bubble.working .hemi-r { animation: bc-think 1.5s ease-in-out infinite 0.75s; }
.bc-bubble.working .synapse { animation: bc-synapse 1.5s ease-in-out infinite; }
@keyframes bc-think {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.07); opacity: 1; }
}
@keyframes bc-synapse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
.bc-toast {
  position: fixed; z-index: 2147483647; left: 50%; bottom: 28px; transform: translateX(-50%);
  background: #1e1e22; color: #ececf1; border: 1px solid #34343c; border-radius: 10px;
  padding: 10px 16px; font-size: 13px; box-shadow: 0 8px 30px rgba(0,0,0,.45);
  animation: bc-fade .12s ease-out;
}
.bc-toast.err { border-color: #5a2a2a; }
.bc-lang { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 6px; max-height: 260px; overflow: auto; }
`;

/** The lazily-created shadow root all assist UI mounts into. */
export function root(): ShadowRoot {
  if (shadow) return shadow;
  const host = document.createElement('div');
  host.id = 'browsecortex-assist-root';
  host.style.cssText = 'all: initial;';
  (document.body || document.documentElement).appendChild(host);
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);
  return shadow;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** Make a button with an optional leading SVG/emoji and a label. */
export function button(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const b = el('button', { class: 'bc-btn', ...(title ? { title } : {}) }, [label]);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const r = root();
  r.querySelector('.bc-toast')?.remove();
  const t = el('div', { class: `bc-toast${kind === 'error' ? ' err' : ''}` }, [message]);
  r.appendChild(t);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

/** True when an event was dispatched from inside our own Shadow DOM UI, so the
 * page-level selection/keyboard listeners can ignore their own widgets. */
export function isInsideUI(e: Event): boolean {
  return !!shadow && e.composedPath().includes(shadow.host);
}

/** Position a popover near a rect, flipping/clamping to stay fully on-screen. */
export function positionNear(pop: HTMLElement, rect: DOMRect): void {
  // Measure after it's in the DOM.
  const pw = pop.offsetWidth || 320;
  const ph = pop.offsetHeight || 80;
  let left = rect.left + rect.width / 2 - pw / 2;
  let top = rect.bottom + 8;
  // Flip above the anchor if it would overflow the bottom edge.
  if (top + ph > window.innerHeight - 8) {
    const above = rect.top - ph - 8;
    top = above >= 8 ? above : top;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  // Clamp both edges so the panel (incl. its action bar) is never off-screen.
  top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

/** Remove every transient popover/menu (but keep the persistent bubble). */
export function dismissPopovers(): void {
  if (!shadow) return;
  shadow.querySelectorAll('.bc-pop').forEach((n) => n.remove());
}
