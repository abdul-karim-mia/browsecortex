/**
 * Lightweight readable-text extraction for the Floating Bubble. Not a full
 * Readability port — it prefers the most content-rich landmark element and
 * falls back to the body, then collapses whitespace and caps length.
 */

const MAX = 12000;

function textOf(node: Element | null): string {
  return (node as HTMLElement | null)?.innerText?.trim() ?? '';
}

export interface PageContent {
  title: string;
  url: string;
  text: string;
}

export function extractPage(): PageContent {
  const candidates = [
    document.querySelector('article'),
    document.querySelector('main'),
    document.querySelector('[role="main"]'),
    document.body,
  ];
  let best = '';
  for (const c of candidates) {
    const t = textOf(c);
    if (t.length > best.length) best = t;
    if (best.length > 2000) break; // good enough — stop at the first rich landmark
  }
  const text = best.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').slice(0, MAX);
  return { title: document.title || location.hostname, url: location.href, text };
}
