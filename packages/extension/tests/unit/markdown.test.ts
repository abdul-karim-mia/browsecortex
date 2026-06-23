import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/sidepanel/markdown';

describe('renderMarkdown', () => {
  it('escapes HTML to prevent injection', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders bold, italic, and inline code', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
    expect(renderMarkdown('text `code` here')).toContain('<code>code</code>');
  });

  it('renders fenced code blocks with contents escaped', () => {
    const html = renderMarkdown('```js\nconst x = 1 < 2;\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('&lt; <span class="text-amber-600 dark:text-amber-400">2</span>');
  });

  it('renders unordered and ordered lists', () => {
    expect(renderMarkdown('- a\n- b')).toContain('<ul>');
    expect(renderMarkdown('1. a\n2. b')).toContain('<ol>');
  });

  it('only allows safe link protocols', () => {
    expect(renderMarkdown('[ok](https://x.com)')).toContain('href="https://x.com"');
    const bad = renderMarkdown('[bad](javascript:alert(1))');
    expect(bad).not.toContain('href="javascript');
  });

  it('renders headings offset by one (# → h2, ## → h3) to avoid h1 in-panel', () => {
    expect(renderMarkdown('# Title')).toContain('<h2>Title</h2>');
    expect(renderMarkdown('## Title')).toContain('<h3>Title</h3>');
  });

  it('renders markdown tables as HTML tables', () => {
    const tableMd = '| Header 1 | Header 2 |\n|---|---|\n| Value 1 | Value 2 |';
    const html = renderMarkdown(tableMd);
    expect(html).toContain('<table');
    expect(html).toContain('Header 1</th>');
    expect(html).toContain('Value 1</td>');
  });
});
