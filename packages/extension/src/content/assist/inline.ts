/**
 * Inline Assist — a keyboard-triggered editor (Ctrl+Shift+K) that appears inside
 * any focused text field. The user types a direct instruction or picks a saved
 * template (installed skill), and the result is inserted/replaced in place.
 *
 * We accept Cmd too, but on macOS the browser reserves Cmd+Shift+K, so Ctrl is
 * the documented combo on every platform.
 */
import { root, el, button, positionNear, dismissPopovers } from './ui';
import { openResultPanel } from './panel';
import { focusedEditable, replaceSelection, insertAtCaret, fieldText, type Editable } from './editable';
import { listInstalled } from '@/skills/store';
import type { InstalledSkill } from '@/skills/types';

const SYSTEM =
  'You are an inline writing assistant operating inside a text field on a web page. ' +
  'Follow the user instruction and output only the text to insert — no preamble, no quotes, ' +
  'no markdown fences. Match the language of the existing content.';

function buildPrompt(instruction: string, existing: string): string {
  const ctx = existing.trim()
    ? `Current field content:\n"""\n${existing.trim().slice(0, 4000)}\n"""\n\n`
    : '';
  return `${ctx}Instruction: ${instruction}`;
}

function generate(field: Editable, instruction: string): void {
  dismissPopovers();
  const rect = field.getBoundingClientRect();
  const existing = fieldText(field);
  const hasSelection = (() => {
    const sel = window.getSelection();
    return sel && !sel.isCollapsed && sel.toString().trim().length > 0;
  })();
  openResultPanel({
    title: 'Inline Assist',
    system: SYSTEM,
    prompt: buildPrompt(instruction, existing),
    rect,
    onInsert: (t) => insertAtCaret(field, t),
    // Replace the selected range if there is one, else the whole field.
    onReplace: (t) => {
      if (hasSelection) replaceSelection(field, t);
      else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.value = t;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        field.textContent = t;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
  });
}

async function templateChips(field: Editable, container: HTMLElement): Promise<void> {
  let skills: InstalledSkill[] = [];
  try {
    skills = await listInstalled();
  } catch {
    return;
  }
  if (skills.length === 0) return;
  const label = el('div', { class: 'bc-title' }, ['Templates']);
  label.style.cssText = 'padding:8px 2px 4px;';
  container.appendChild(label);
  const wrap = el('div', { class: 'bc-bar' });
  wrap.style.flexWrap = 'wrap';
  for (const s of skills.slice(0, 8)) {
    wrap.appendChild(
      button(s.name, () =>
        generate(field, `Apply this template/skill to the content:\n\n${s.content.slice(0, 4000)}`),
      ),
    );
  }
  container.appendChild(wrap);
}

function openPrompt(field: Editable): void {
  dismissPopovers();
  const r = root();
  const pop = el('div', { class: 'bc-pop' });
  pop.style.width = '340px';

  const head = el('div', { class: 'bc-panel-head' }, [
    el('div', { class: 'bc-title' }, ['Inline Assist']),
    (() => {
      const x = el('div', { class: 'bc-x', title: 'Close (Esc)' }, ['✕']);
      x.addEventListener('click', () => pop.remove());
      return x;
    })(),
  ]);

  const ta = el('textarea', {
    class: 'bc-input',
    rows: '2',
    placeholder: 'Tell the assistant what to write or change…',
  }) as HTMLTextAreaElement;

  const body = el('div', { class: 'bc-panel' }, [ta]);
  templateChips(field, body);

  const actions = el('div', { class: 'bc-actions' });
  const goBtn = button('Generate ⏎', () => {
    const v = ta.value.trim();
    if (v) generate(field, v);
  });
  actions.appendChild(goBtn);

  pop.append(head, body, actions);
  r.appendChild(pop);
  positionNear(pop, field.getBoundingClientRect());

  ta.focus();
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const v = ta.value.trim();
      if (v) generate(field, v);
    } else if (e.key === 'Escape') {
      pop.remove();
    }
  });
}

export function initInline(): void {
  // Remember the most recently focused editable. Some rich editors briefly move
  // focus to a wrapper when a shortcut fires, so `document.activeElement` isn't
  // always the field — this fallback keeps the shortcut reliable.
  let lastEditable: Editable | null = null;
  document.addEventListener(
    'focusin',
    () => {
      const fe = focusedEditable();
      if (fe) lastEditable = fe;
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      const mod = e.ctrlKey || e.metaKey;
      // Use e.code so the trigger is keyboard-layout independent.
      const isK = e.code === 'KeyK' || e.key === 'K' || e.key === 'k';
      if (!mod || !e.shiftKey || !isK) return;
      const field = focusedEditable() ?? lastEditable;
      if (!field) return;
      e.preventDefault();
      e.stopPropagation();
      openPrompt(field);
    },
    true,
  );
}
