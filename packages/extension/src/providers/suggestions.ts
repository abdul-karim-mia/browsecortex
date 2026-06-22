/**
 * Well-known provider base-URL suggestions (PLAN §5).
 * Used for the Base URL auto-fill dropdown with fuzzy search.
 */
export interface ProviderSuggestion {
  name: string;
  baseUrl: string;
  apiKeyUrl: string | null;
}

export const PROVIDER_SUGGESTIONS: ProviderSuggestion[] = [
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyUrl: 'https://console.groq.com/keys',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyUrl: 'https://cloud.cerebras.ai',
  },
  {
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyUrl: 'https://build.nvidia.com',
  },
  {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    apiKeyUrl: 'https://dashboard.cohere.com/api-keys',
  },
  {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    apiKeyUrl: 'https://perplexity.ai/settings/api',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyUrl: 'https://fireworks.ai/account/api-keys',
  },
  {
    name: 'Deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  { name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', apiKeyUrl: 'https://console.x.ai' },
  {
    name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKeyUrl: 'https://opencode.ai/zen',
  },
  {
    name: 'Ollama Cloud',
    baseUrl: 'https://ollama.com/v1',
    apiKeyUrl: 'https://ollama.com/settings/keys',
  },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', apiKeyUrl: null },
  { name: 'LiteLLM (local)', baseUrl: 'http://localhost:4000/v1', apiKeyUrl: null },
  { name: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', apiKeyUrl: null },
  { name: 'Jan (local)', baseUrl: 'http://localhost:1337/v1', apiKeyUrl: null },
];

/** Simple substring fuzzy match over name and baseUrl. */
export function searchSuggestions(query: string): ProviderSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return PROVIDER_SUGGESTIONS;
  return PROVIDER_SUGGESTIONS.filter(
    (s) => s.name.toLowerCase().includes(q) || s.baseUrl.toLowerCase().includes(q),
  );
}
