import { describe, it, expect } from 'vitest';
import { matchesPattern, blockedToolsForUrl } from '@/tools/site-rules';
import type { SiteToolRule } from '@/types';

describe('site-rules matching', () => {
  it('matches a bare hostname', () => {
    expect(matchesPattern('example.com', 'https://example.com/path')).toBe(true);
  });

  it('matches wildcard subdomains', () => {
    expect(matchesPattern('*.bank.com', 'https://secure.bank.com/login')).toBe(true);
    expect(matchesPattern('*.bank.com', 'https://bank.com/login')).toBe(false); // no subdomain
  });

  it('matches a full-URL wildcard pattern', () => {
    expect(matchesPattern('https://example.com/*', 'https://example.com/a/b')).toBe(true);
    expect(matchesPattern('https://example.com/*', 'https://other.com/a')).toBe(false);
  });

  it('does not match unrelated hosts', () => {
    expect(matchesPattern('example.com', 'https://notexample.com/')).toBe(false);
  });

  it('handles empty pattern / url safely', () => {
    expect(matchesPattern('', 'https://x.com')).toBe(false);
    expect(matchesPattern('x.com', '')).toBe(false);
  });
});

describe('blockedToolsForUrl', () => {
  const rules: SiteToolRule[] = [
    { pattern: '*.bank.com', blockedTools: ['run_javascript', 'fill_input'] },
    { pattern: 'example.com', blockedTools: ['click_element'] },
  ];

  it('unions blocked tools across matching rules', () => {
    const blocked = blockedToolsForUrl(rules, 'https://secure.bank.com/');
    expect([...blocked].sort()).toEqual(['fill_input', 'run_javascript']);
  });

  it('returns empty when nothing matches', () => {
    expect(blockedToolsForUrl(rules, 'https://safe.org/').size).toBe(0);
  });

  it('returns empty for missing url or rules', () => {
    expect(blockedToolsForUrl(rules, undefined).size).toBe(0);
    expect(blockedToolsForUrl(undefined, 'https://x.com').size).toBe(0);
  });
});
