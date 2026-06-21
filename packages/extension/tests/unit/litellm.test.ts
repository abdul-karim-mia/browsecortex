import { describe, it, expect } from 'vitest';
import { lookup } from '@/models/litellm';

const catalog = {
  'gpt-4o': { max_input_tokens: 128000, supports_vision: true },
  'llama3-70b-8192': { max_input_tokens: 8192, supports_function_calling: true },
  'groq/llama-3.3-70b-versatile': { max_input_tokens: 128000, supports_function_calling: true },
  'gemini/gemini-2.5-flash': { max_input_tokens: 1048576, supports_vision: true },
};

describe('litellm lookup', () => {
  it('finds an exact model id', () => {
    expect(lookup(catalog, 'gpt-4o')?.max_input_tokens).toBe(128000);
  });

  it('strips a provider prefix before matching', () => {
    expect(lookup(catalog, 'openai/gpt-4o')?.supports_vision).toBe(true);
  });

  it('matches a bare id against a provider-prefixed catalog key', () => {
    // Provider /v1/models returns "llama-3.3-70b-versatile"; catalog has
    // "groq/llama-3.3-70b-versatile".
    expect(lookup(catalog, 'llama-3.3-70b-versatile')?.supports_function_calling).toBe(true);
    expect(lookup(catalog, 'gemini-2.5-flash')?.supports_vision).toBe(true);
  });

  it('returns undefined for an unknown model', () => {
    expect(lookup(catalog, 'mystery-model')).toBeUndefined();
  });
});
