/**
 * Floating Bubble — a persistent gateway widget pinned bottom-right. Clicking it
 * summarizes the current page. The bubble pulses while a summary is generating.
 */
import { root, el, toast } from './ui';
import { openResultPanel } from './panel';
import { extractPage } from './page';
import { BRAND_SVG } from './icon';

const SUMMARY_SYSTEM =
  'You summarize web pages. Produce a concise summary in markdown: a bold **Summary** line ' +
  'followed by 3-6 bullet points of the key takeaways. Use markdown formatting.';

let bubbleEl: HTMLElement | null = null;

function setWorking(busy: boolean): void {
  bubbleEl?.classList.toggle('working', busy);
}

function summarize(): void {
  const page = extractPage();
  if (!page.text) {
    toast('No readable text found on this page', 'error');
    return;
  }
  openResultPanel({
    title: 'Page summary',
    system: SUMMARY_SYSTEM,
    prompt: `Title: ${page.title}\nURL: ${page.url}\n\nContent:\n${page.text}`,
    onBusyChange: setWorking,
  });
}

export function initBubble(): void {
  // Some embeds/iframes shouldn't get a floating widget.
  if (window.top !== window.self) return;
  const r = root();
  const bubble = el('button', { class: 'bc-bubble', title: 'Summarize this page' });
  bubble.innerHTML = BRAND_SVG;
  bubble.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    summarize();
  });
  r.appendChild(bubble);
  bubbleEl = bubble;
}
