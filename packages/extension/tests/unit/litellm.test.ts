import { describe, it, expect } from 'vitest';
import { lookup } from '@/models/litellm';

const catalog = {
  'gpt-4o': { max_input_tokens: 128000, supports_vision: true, supports_tool_choice: true },
  'llama3-70b-8192': { max_input_tokens: 8192, supports_function_calling: true },
  'groq/llama-3.3-70b-versatile': { max_input_tokens: 128000, supports_function_calling: true },
  'gemini/gemini-2.5-flash': { max_input_tokens: 1048576, supports_vision: true },
  'openrouter/meta-llama/llama-3.3-70b-instruct': { input_cost_per_token: 0.000001 },
  'meta-llama/llama-3.3-70b-instruct': { max_input_tokens: 128000, supports_parallel_function_calling: true },
  'azure_ai/deepseek-v4-flash': { supports_function_calling: true, supports_reasoning: true, supports_tool_choice: true },
};

describe('litellm lookup', () => {
  it('finds an exact model id', () => {
    const entry = lookup(catalog, 'gpt-4o');
    expect(entry?.max_input_tokens).toBe(128000);
    expect(entry?.supports_tool_choice).toBe(true);
  });

  it('strips a provider prefix before matching', () => {
    expect(lookup(catalog, 'openai/gpt-4o')?.supports_vision).toBe(true);
  });

  it('matches a bare id against a provider-prefixed catalog key', () => {
    expect(lookup(catalog, 'llama-3.3-70b-versatile')?.supports_function_calling).toBe(true);
    expect(lookup(catalog, 'gemini-2.5-flash')?.supports_vision).toBe(true);
  });

  it('sanitizes free suffixes like :free, -free, /free, and free', () => {
    expect(lookup(catalog, 'gpt-4o:free')?.max_input_tokens).toBe(128000);
    expect(lookup(catalog, 'gemini-2.5-flash-free')?.supports_vision).toBe(true);
    expect(lookup(catalog, 'openai/gpt-4o/free')?.supports_vision).toBe(true);
    expect(lookup(catalog, 'gpt-4o free')?.max_input_tokens).toBe(128000);
  });

  it('merges multiple matching entries for the same model', () => {
    const entry = lookup(catalog, 'llama-3.3-70b-instruct');
    expect(entry).toBeDefined();
    expect(entry?.input_cost_per_token).toBe(0.000001);
    expect(entry?.max_input_tokens).toBe(128000);
    expect(entry?.supports_parallel_function_calling).toBe(true);
  });

  it('falls back to bare model name without provider and removing free if no exact match found', () => {
    const entry = lookup(catalog, 'myprovider/llama-3.3-70b-instruct:free');
    expect(entry).toBeDefined();
    expect(entry?.max_input_tokens).toBe(128000);
    expect(entry?.input_cost_per_token).toBe(0.000001);
  });

  it('correctly matches deepseek-v4-flash-free to azure_ai/deepseek-v4-flash and gets tool choice and reasoning', () => {
    const entry = lookup(catalog, 'deepseek-v4-flash-free');
    expect(entry).toBeDefined();
    expect(entry?.supports_tool_choice).toBe(true);
    expect(entry?.supports_reasoning).toBe(true);
  });

  it('returns undefined for an unknown model', () => {
    expect(lookup(catalog, 'mystery-model')).toBeUndefined();
  });
});
