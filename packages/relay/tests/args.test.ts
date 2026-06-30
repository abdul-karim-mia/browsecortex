import { describe, expect, test } from 'vitest';
import { validatePort, validateSeconds, tokenMatches } from '../src/index.js';

describe('validatePort', () => {
  test('accepts valid ports', () => {
    expect(validatePort('7822')).toBe(7822);
    expect(validatePort('1')).toBe(1);
    expect(validatePort('65535')).toBe(65535);
  });

  test('rejects out-of-range ports', () => {
    expect(validatePort('0')).toBeNull();
    expect(validatePort('-1')).toBeNull();
    expect(validatePort('65536')).toBeNull();
    expect(validatePort('99999')).toBeNull();
  });

  test('rejects non-integer and missing values', () => {
    expect(validatePort('abc')).toBeNull();
    expect(validatePort('80.5')).toBeNull();
    expect(validatePort('')).toBeNull();
    expect(validatePort(undefined)).toBeNull();
  });
});

describe('validateSeconds', () => {
  test('accepts zero and positive integers', () => {
    expect(validateSeconds('0')).toBe(0);
    expect(validateSeconds('30')).toBe(30);
    expect(validateSeconds('3600')).toBe(3600);
  });

  test('rejects negative, non-integer, and missing values', () => {
    expect(validateSeconds('-1')).toBeNull();
    expect(validateSeconds('1.5')).toBeNull();
    expect(validateSeconds('abc')).toBeNull();
    expect(validateSeconds('')).toBeNull();
    expect(validateSeconds(undefined)).toBeNull();
  });
});

describe('tokenMatches', () => {
  test('matches identical tokens', () => {
    expect(tokenMatches('secret', 'secret')).toBe(true);
  });

  test('rejects different tokens', () => {
    expect(tokenMatches('secret', 'other!')).toBe(false);
  });

  test('rejects on length mismatch without throwing', () => {
    expect(tokenMatches('short', 'longer-token')).toBe(false);
    expect(tokenMatches('', 'token')).toBe(false);
    expect(tokenMatches('token', '')).toBe(false);
  });
});
