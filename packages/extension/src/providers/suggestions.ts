/**
 * Well-known provider base-URL suggestions (PLAN §5).
 * Used for the Base URL auto-fill dropdown with fuzzy search.
 */
export interface ProviderSuggestion {
  name: string;
  baseUrl: string;
  apiKeyUrl: string | null;
  affiliateUrl?: string | null;
}

export const PROVIDER_SUGGESTIONS: ProviderSuggestion[] = [
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Anthropic',
    baseUrl: 'Not natively supported (Requires proxy/aggregator like OpenRouter)',
    apiKeyUrl: 'https://console.anthropic.com/',
  },
  {
    name: 'Google AI / Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyUrl: 'https://aistudio.google.com/',
  },
  {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyUrl: 'https://console.mistral.ai/api-keys/',
  },
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    affiliateUrl: 'https://byteplus.pxf.io/oNo7PW',
  },
  {
    name: 'Cohere',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    apiKeyUrl: 'https://dashboard.cohere.com/',
  },
  {
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    apiKeyUrl: 'https://console.x.ai/',
  },
  {
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKeyUrl: 'https://platform.minimaxi.com/',
  },
  {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyUrl: 'https://platform.moonshot.cn/',
  },
  {
    name: 'Z.AI (Zhipu AI)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyUrl: 'https://open.bigmodel.cn/',
  },
  {
    name: 'Alibaba Cloud',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/',
  },
  {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyUrl: 'https://console.groq.com/keys',
  },
  {
    name: 'Together AI',
    baseUrl: 'https://api.together.ai/v1',
    apiKeyUrl: 'https://api.together.ai/settings/api-keys',
  },
  {
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyUrl: 'https://fireworks.ai/account/api-keys',
  },
  {
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.com/v1',
    apiKeyUrl: 'https://cloud.siliconflow.com/account/ak',
  },
  {
    name: 'Novita AI',
    baseUrl: 'https://api.novita.ai/openai/v1',
    apiKeyUrl: 'https://novita.ai/settings/key-management',
    affiliateUrl: 'https://fas.st/t/NgtFLvFc',
  },
  {
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    apiKeyUrl: 'https://deepinfra.com/dash/api_keys',
  },
  {
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyUrl: 'https://cloud.cerebras.ai/',
  },
  {
    name: 'SambaNova',
    baseUrl: 'https://api.sambanova.ai/v1',
    apiKeyUrl: 'https://cloud.sambanova.ai/',
  },
  {
    name: 'Replicate',
    baseUrl: 'Not natively supported (Requires proxy/compatibility wrapper)',
    apiKeyUrl: 'https://replicate.com/account/api-tokens',
  },
  {
    name: 'Fal.ai',
    baseUrl: 'Not natively supported (Requires adapter proxy layer)',
    apiKeyUrl: 'https://fal.ai/dashboard/keys',
  },
  {
    name: 'WaveSpeedAI',
    baseUrl: 'https://api.wavespeed.ai/v1',
    apiKeyUrl: 'https://dashboard.wavespeed.ai/',
  },
  {
    name: 'CoreWeave',
    baseUrl: 'Custom endpoint mapped via dedicated instance setup',
    apiKeyUrl: 'https://cloud.coreweave.com/',
  },
  {
    name: 'Nebius AI',
    baseUrl: 'https://api.tokenfactory.nebius.com/v1/',
    apiKeyUrl: 'https://docs.tokenfactory.nebius.com/',
  },
  {
    name: 'OpenCode Go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiKeyUrl: 'https://opencode.ai/go',
  },
  {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    name: 'LLM Gateway',
    baseUrl: 'https://api.llmgateway.ai/v1',
    apiKeyUrl: 'https://llmgateway.ai/',
  },
  {
    name: 'WisGate',
    baseUrl: 'https://api.wisgate.com/v1',
    apiKeyUrl: 'https://wisgate.com/',
  },
  {
    name: 'Requesty.ai',
    baseUrl: 'https://api.requesty.ai/v1',
    apiKeyUrl: 'https://requesty.ai/',
  },
  {
    name: 'Inference.net',
    baseUrl: 'https://api.inference.net/v1',
    apiKeyUrl: 'https://inference.net/',
  },
  {
    name: 'Microsoft Azure AI Foundry',
    baseUrl: 'https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}',
    apiKeyUrl: 'https://portal.azure.com/',
  },
  {
    name: 'Amazon Bedrock',
    baseUrl: 'Requires orchestration wrapper (e.g., AWS SDK or LiteLLM)',
    apiKeyUrl: 'https://console.aws.amazon.com/',
  },
  {
    name: 'Google Cloud Vertex AI',
    baseUrl: 'https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/',
    apiKeyUrl: 'https://console.cloud.google.com/',
  },
  {
    name: 'IBM watsonx.ai',
    baseUrl: 'Requires mapping endpoints via Cloud Stage Deployment configurations',
    apiKeyUrl: 'https://cloud.ibm.com/',
  },
  {
    name: 'Baseten',
    baseUrl: 'https://inference.baseten.co/v1',
    apiKeyUrl: 'https://dashboard.baseten.co/',
  },
  {
    name: 'AI21 Labs',
    baseUrl: 'https://api.ai21.com/studio/v1/',
    apiKeyUrl: 'https://docs.ai21.com/docs/create-api-key',
  },
  {
    name: 'Upstage',
    baseUrl: 'https://api.upstage.ai/v1',
    apiKeyUrl: 'https://console.upstage.ai/',
  },
  {
    name: 'NLP Cloud',
    baseUrl: 'https://api.nlpcloud.com/v1',
    apiKeyUrl: 'https://dashboard.nlpcloud.com/',
  },
  {
    name: 'Modal',
    baseUrl: 'https://{username}-{app_name}.modal.run/v1 (Generated upon dynamic endpoint launch)',
    apiKeyUrl: 'https://modal.com/dashboard',
  },
  {
    name: 'Hyperbolic',
    baseUrl: 'https://api.hyperbolic.xyz/v1',
    apiKeyUrl: 'https://hyperbolic.xyz/',
  },
  {
    name: 'Scaleway',
    baseUrl: 'https://api.scaleway.ai/v1',
    apiKeyUrl: 'https://console.scaleway.com/',
  },
  {
    name: 'Cloudflare Workers AI',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1',
    apiKeyUrl: 'https://dash.cloudflare.com/',
  },
  {
    name: 'GitHub Models',
    baseUrl: 'https://models.github.ai/inference',
    apiKeyUrl: 'https://github.com/marketplace/models',
  },
  {
    name: 'Vercel AI Gateway',
    baseUrl: 'https://gateway.ai.vercel.com/v1',
    apiKeyUrl: 'https://vercel.com/',
  },
  {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyUrl: null,
  },
  {
    name: 'LocalAI',
    baseUrl: 'http://localhost:8080/v1',
    apiKeyUrl: null,
  },
  {
    name: 'vLLM',
    baseUrl: 'http://localhost:8000/v1',
    apiKeyUrl: null,
  },
  {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    apiKeyUrl: null,
  },
  {
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKeyUrl: 'https://huggingface.co/settings/tokens',
  },
];

/** Simple substring fuzzy match over name and baseUrl. */
export function searchSuggestions(query: string): ProviderSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return PROVIDER_SUGGESTIONS;
  return PROVIDER_SUGGESTIONS.filter(
    (s) => s.name.toLowerCase().includes(q) || s.baseUrl.toLowerCase().includes(q),
  );
}
