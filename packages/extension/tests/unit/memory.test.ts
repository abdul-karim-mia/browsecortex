import { describe, it, expect } from 'vitest';
import { extractKeywords } from '@/memory/retrieval';

describe('extractKeywords', () => {
  it('lowercases, splits, and drops stopwords and short tokens', () => {
    const kw = extractKeywords('I want to set up a React project with Tailwind');
    expect(kw).toContain('set');
    expect(kw).toContain('react');
    expect(kw).toContain('project');
    expect(kw).toContain('tailwind');
    expect(kw).not.toContain('to');
    expect(kw).not.toContain('a');
    expect(kw).not.toContain('i');
  });

  it('returns an empty array for stopword-only input', () => {
    expect(extractKeywords('to a the it is')).toEqual([]);
  });

  it('keeps non-Latin scripts instead of dropping them', () => {
    // Old ASCII-only split would have erased all of these (M-EXT-6).
    expect(extractKeywords('深圳 React 项目')).toContain('深圳');
    expect(extractKeywords('مرحبا بالعالم')).toContain('مرحبا');
    const mixed = extractKeywords('Café питон');
    expect(mixed).toContain('café');
    expect(mixed).toContain('питон');
  });
});
