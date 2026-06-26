/**
 * A streaming result popover shared by the toolbar, inline assist, and bubble.
 * Runs a completion, renders tokens live, and offers Copy / Replace / Insert
 * actions depending on what the caller wires up.
 */
import { root, el, button, positionNear, dismissPopovers, toast } from './ui';
import { run } from './bridge';
import { renderMarkdown } from '@/sidepanel/utils/markdown';

export interface ResultPanelOpts {
  title: string;
  system?: string;
  prompt: string;
  /** Where to anchor the panel; falls back to bottom-right if omitted. */
  rect?: DOMRect;
  /** Replace the originating selection/field with the result. */
  onReplace?: (text: string) => void;
  /** Insert the result at the cursor (distinct from replace). */
  onInsert?: (text: string) => void;
  /** Notified while a completion is in flight (e.g. to animate the trigger). */
  onBusyChange?: (busy: boolean) => void;
}

export function openResultPanel(opts: ResultPanelOpts): void {
  dismissPopovers();
  const r = root();

  const out = el('div', { class: 'bc-out' });
  const spinner = el('span', { class: 'bc-spin' });
  const body = el('div', { class: 'bc-panel' }, [spinner, out]);

  const closeX = el('div', { class: 'bc-x', title: 'Close' }, ['✕']);
  const head = el('div', { class: 'bc-panel-head' }, [
    el('div', { class: 'bc-title' }, [opts.title]),
    closeX,
  ]);

  const pop = el('div', { class: 'bc-pop' }, [head]);
  pop.style.width = '360px';
  pop.appendChild(body);
  r.appendChild(pop);

  if (opts.rect) positionNear(pop, opts.rect);
  else {
    pop.style.right = '18px';
    pop.style.bottom = '74px';
  }

  opts.onBusyChange?.(true);

  let handleText = '';
  const real = run({
    system: opts.system,
    prompt: opts.prompt,
    onToken: (chunk) => {
      handleText += chunk;
      spinner.remove();
      out.innerHTML = renderMarkdown(handleText);
      if (opts.rect) positionNear(pop, opts.rect);
    },
  });

  const finish = (full: string) => {
    opts.onBusyChange?.(false);
    handleText = full || handleText;
    out.innerHTML = renderMarkdown(handleText);
    spinner.remove();
    const actions = el('div', { class: 'bc-actions' });
    actions.appendChild(
      button('Copy', () => {
        navigator.clipboard?.writeText(handleText).then(
          () => toast('Copied'),
          () => toast('Copy failed', 'error'),
        );
      }),
    );
    if (opts.onReplace)
      actions.appendChild(
        button('Replace', () => {
          opts.onReplace!(handleText);
          pop.remove();
        }),
      );
    if (opts.onInsert)
      actions.appendChild(
        button('Insert', () => {
          opts.onInsert!(handleText);
          pop.remove();
        }),
      );
    pop.appendChild(actions);
    if (opts.rect) positionNear(pop, opts.rect);
  };

  real.result.then(finish).catch((e: Error) => {
    opts.onBusyChange?.(false);
    spinner.remove();
    out.textContent = `⚠ ${e.message}`;
  });

  // Abort the run, stop any busy animation, and tear the panel down.
  const dismiss = () => {
    real.abort();
    opts.onBusyChange?.(false);
    pop.remove();
    cleanup();
  };

  closeX.addEventListener('click', dismiss);

  // Dismiss on outside click / Escape.
  const onDocClick = (e: MouseEvent) => {
    if (!e.composedPath().includes(pop)) dismiss();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  const cleanup = () => {
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
  };
  // Defer so the click that opened the panel doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('mousedown', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}
