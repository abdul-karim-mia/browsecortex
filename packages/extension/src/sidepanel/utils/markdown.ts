/**
 * Minimal, XSS-safe markdown → HTML renderer (PLAN §7).
 *
 * Safe by construction: all text is HTML-escaped first, then a fixed set of
 * transforms is applied. Fenced code blocks are extracted before escaping and
 * restored as escaped <pre> blocks. Links are restricted to http(s)/mailto.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // Inline code
  out = out.replace(/`([^`]+)`/g, (_, c: string) => `<code>${c}</code>`);
  // Bold then italic
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label: string, url: string) => {
    const href = safeHref(url);
    return href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : m;
  });
  return out;
}

import { highlightCode, highlightJSON } from './highlighter';

/** Inline copy glyph (renderer can't import the Preact Icon component); the copy
 * action is wired via event delegation in MessageBubble. */
const COPY_GLYPH =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export function renderMarkdown(src: string): string {
  const codeBlocks: string[] = [];
  // Extract fenced code blocks first so their contents aren't transformed.
  const withoutCode = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang: string, code: string) => {
    const idx = codeBlocks.length;
    const cleanCode = code.replace(/\n$/, '');
    const langLower = lang.toLowerCase();

    let highlightedHtml = '';
    if (langLower === 'json') {
      highlightedHtml = highlightJSON(cleanCode);
    } else {
      highlightedHtml = highlightCode(cleanCode, `code.${lang}`, `text/${lang}`);
    }

    const langBadge = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
    codeBlocks.push(
      `<div class="code-block"><div class="code-head">${langBadge}` +
        `<button class="code-copy" type="button" aria-label="Copy code" title="Copy code">${COPY_GLYPH}</button>` +
        `</div><pre data-lang="${escapeHtml(lang)}"><code>${highlightedHtml}</code></pre></div>`,
    );
    return ` CODE${idx} `;
  });

  const lines = withoutCode.split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inTable = false;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html.push('</tbody></table></div>');
      inTable = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|');

    if (!isTableRow) {
      closeTable();
    }

    const codeMatch = /^\s*CODE(\d+)\s*$/.exec(trimmed);
    if (codeMatch) {
      closeList();
      html.push(codeBlocks[Number(codeMatch[1])]);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length + 1; // h2..h5
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (isTableRow) {
      closeList();
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      const isSeparator = cells.every(c => /^[:-]+$/.test(c));

      if (isSeparator) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        html.push('<div class="overflow-x-auto my-3 border border-gray-250 dark:border-gray-800 rounded-lg"><table class="min-w-full divide-y divide-gray-200 dark:divide-gray-850 text-left border-collapse">');
        html.push('<thead class="bg-gray-50 dark:bg-gray-900"><tr>');
        cells.forEach(c => {
          html.push(`<th class="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-250 dark:border-gray-800">${renderInline(c)}</th>`);
        });
        html.push('</tr></thead>');
        html.push('<tbody class="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-950">');
      } else {
        html.push('<tr class="hover:bg-gray-50 dark:hover:bg-gray-900/40 odd:bg-white dark:odd:bg-gray-950 even:bg-gray-50/30 dark:even:bg-gray-900/10">');
        cells.forEach(c => {
          html.push(`<td class="px-3 py-1.5 text-xs text-gray-650 dark:text-gray-300">${renderInline(c)}</td>`);
        });
        html.push('</tr>');
      }
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      const want = ul ? 'ul' : 'ol';
      if (listType !== want) {
        closeList();
        listType = want;
        html.push(`<${want}>`);
      }
      html.push(`<li>${renderInline((ul ?? ol)![1])}</li>`);
      continue;
    }

    if (trimmed === '') {
      closeList();
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }

  closeList();
  closeTable();

  return html.join('\n');
}
