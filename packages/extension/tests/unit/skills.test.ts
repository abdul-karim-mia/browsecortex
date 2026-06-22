import { describe, it, expect } from 'vitest';
import { substituteVars } from '@/skills/substitute';

describe('substituteVars', () => {
  it('replaces known placeholders', () => {
    expect(
      substituteVars('Research {{topic}} at {{depth}} depth', { topic: 'AI', depth: 'deep' }),
    ).toBe('Research AI at deep depth');
  });

  it('tolerates whitespace inside braces', () => {
    expect(substituteVars('Hello {{ name }}', { name: 'world' })).toBe('Hello world');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(substituteVars('Keep {{missing}} as-is', {})).toBe('Keep {{missing}} as-is');
  });
});
