/**
 * Highlight Toolbar — a contextual overlay that appears when the user selects
 * text. Offers Rewrite, Translate (25 languages), Tone shift, Expand, and
 * text-to-speech (Read aloud).
 */
import { root, el, button, positionNear, dismissPopovers, isInsideUI, toast } from './ui';
import { openResultPanel } from './panel';
import { LANGUAGES } from './languages';
import { focusedEditable, replaceSelection, type Editable } from './editable';

const TONES = ['Professional', 'Casual', 'Friendly', 'Confident', 'Concise', 'Persuasive'];

interface Context {
  text: string;
  rect: DOMRect;
  /** Set when the selection lives in an editable field (enables Replace). */
  editable: Editable | null;
}

function currentContext(): Context | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  const text = sel.toString().trim();
  if (text.length < 2) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const editable = focusedEditable();
  return { text, rect, editable };
}

function replacer(ctx: Context): ((t: string) => void) | undefined {
  if (!ctx.editable) return undefined;
  const field = ctx.editable;
  return (t: string) => replaceSelection(field, t);
}

function action(ctx: Context, title: string, system: string, prompt: string): void {
  dismissPopovers();
  openResultPanel({ title, system, prompt, rect: ctx.rect, onReplace: replacer(ctx) });
}

function readAloud(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) {
      toast('Text-to-speech is not available here', 'error');
      return;
    }
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
    toast('Reading aloud…');
  } catch {
    toast('Text-to-speech failed', 'error');
  }
}

/** A small flyout menu anchored under a toolbar button. */
function flyout(items: { label: string; onClick: () => void }[], anchor: HTMLElement): void {
  const r = root();
  r.querySelector('.bc-flyout')?.remove();
  const menu = el('div', { class: 'bc-pop bc-flyout' });
  const inner = el('div', { class: 'bc-menu' });
  for (const it of items) inner.appendChild(button(it.label, it.onClick));
  menu.appendChild(inner);
  r.appendChild(menu);
  const ar = anchor.getBoundingClientRect();
  positionNear(menu, ar);
}

function langFlyout(ctx: Context, anchor: HTMLElement): void {
  const r = root();
  r.querySelector('.bc-flyout')?.remove();
  const menu = el('div', { class: 'bc-pop bc-flyout' });
  const grid = el('div', { class: 'bc-lang' });
  for (const lang of LANGUAGES) {
    grid.appendChild(
      button(lang, () =>
        action(
          ctx,
          `Translate → ${lang}`,
          'You are a professional translator. Output only the translation, nothing else.',
          `Translate the following text into ${lang}:\n\n${ctx.text}`,
        ),
      ),
    );
  }
  menu.appendChild(grid);
  r.appendChild(menu);
  positionNear(menu, anchor.getBoundingClientRect());
}

function buildToolbar(ctx: Context): HTMLElement {
  const bar = el('div', { class: 'bc-pop bc-toolbar' });
  const row = el('div', { class: 'bc-bar' });

  row.appendChild(
    button('✎ Rewrite', () =>
      action(
        ctx,
        'Rewrite',
        'You rewrite text to be clearer and better-worded while preserving meaning and language. Output only the rewritten text.',
        `Rewrite this:\n\n${ctx.text}`,
      ),
    ),
  );

  const translateBtn = button('🌐 Translate ▾', () => langFlyout(ctx, translateBtn));
  row.appendChild(translateBtn);

  const toneBtn = button('🎭 Tone ▾', () =>
    flyout(
      TONES.map((tone) => ({
        label: tone,
        onClick: () =>
          action(
            ctx,
            `Tone → ${tone}`,
            `You rewrite text in a ${tone.toLowerCase()} tone, preserving meaning and language. Output only the rewritten text.`,
            `Rewrite this in a ${tone.toLowerCase()} tone:\n\n${ctx.text}`,
          ),
      })),
      toneBtn,
    ),
  );
  row.appendChild(toneBtn);

  row.appendChild(
    button('↔ Expand', () =>
      action(
        ctx,
        'Expand',
        'You expand text with more detail and explanation while preserving meaning, tone, and language. Output only the expanded text.',
        `Expand this:\n\n${ctx.text}`,
      ),
    ),
  );

  row.appendChild(el('div', { class: 'bc-sep' }));
  row.appendChild(button('🔊 Read', () => readAloud(ctx.text), 'Read aloud'));

  bar.appendChild(row);
  return bar;
}

let lastShownFor = '';

function show(): void {
  // Never rebuild the toolbar over an open result panel — doing so would
  // dismiss the in-flight completion the user just launched.
  if (root().querySelector('.bc-panel')) return;
  const ctx = currentContext();
  if (!ctx) return;
  // Avoid re-showing for the identical selection (selectionchange fires a lot).
  const key = `${ctx.text}@${Math.round(ctx.rect.left)},${Math.round(ctx.rect.top)}`;
  if (key === lastShownFor && root().querySelector('.bc-bar')) return;
  lastShownFor = key;

  dismissPopovers();
  const bar = buildToolbar(ctx);
  root().appendChild(bar);
  positionNear(bar, ctx.rect);
}

export function initToolbar(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Debounce: wait for the selection to settle (mouseup/keyup) before showing.
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(show, 180);
  };
  // Ignore mouse/key events coming from our own widgets (toolbar buttons,
  // flyouts, result panel) — otherwise clicking a toolbar button would
  // re-trigger the toolbar and tear down the panel it just opened.
  document.addEventListener(
    'mouseup',
    (e) => {
      if (isInsideUI(e)) return;
      schedule();
    },
    true,
  );
  document.addEventListener('keyup', (e) => {
    if (isInsideUI(e)) return;
    if (e.shiftKey || e.key === 'Shift') schedule();
  });
  // Close the Translate/Tone flyouts on an outside click or Escape, even when
  // the user opened one and then dismissed without picking anything.
  const closeFlyouts = () => root().querySelectorAll('.bc-flyout').forEach((n) => n.remove());
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!isInsideUI(e)) closeFlyouts();
    },
    true,
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFlyouts();
  });

  // Hide when the selection collapses.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      lastShownFor = '';
      root()
        .querySelectorAll('.bc-bar')
        .forEach((n) => n.closest('.bc-pop')?.remove());
      closeFlyouts();
    }
  });
}
