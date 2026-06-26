# Providers

BrowseCortex works with any OpenAI-compatible `/chat/completions` endpoint. Add
providers in Settings → Providers; the Base URL field offers one-click presets.

| Provider | Base URL | Notes |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | |
| Anthropic | `Not natively supported` | Requires proxy/aggregator like OpenRouter |
| Google AI / Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | Free tier rate-limits the OpenAI endpoint |
| Mistral AI | `https://api.mistral.ai/v1` | |
| DeepSeek | `https://api.deepseek.com/v1` | [Affiliate Link](https://byteplus.pxf.io/oNo7PW) |
| Cohere | `https://api.cohere.ai/compatibility/v1` | |
| xAI | `https://api.x.ai/v1` | |
| MiniMax | `https://api.minimax.chat/v1` | |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` | |
| Z.AI (Zhipu AI) | `https://open.bigmodel.cn/api/paas/v4` | |
| Alibaba Cloud | `https://dashscope.aliyuncs.com/compatible-mode/v1` | |
| Groq | `https://api.groq.com/openai/v1` | |
| Together AI | `https://api.together.ai/v1` | |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | |
| SiliconFlow | `https://api.siliconflow.com/v1` | |
| Novita AI | `https://api.novita.ai/openai/v1` | [Affiliate Link](https://fas.st/t/NgtFLvFc) |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | |
| Cerebras | `https://api.cerebras.ai/v1` | |
| SambaNova | `https://api.sambanova.ai/v1` | |
| Replicate | `Not natively supported` | Requires proxy/compatibility wrapper |
| Fal.ai | `Not natively supported` | Requires adapter proxy layer |
| WaveSpeedAI | `https://api.wavespeed.ai/v1` | |
| CoreWeave | `Custom endpoint mapped` | Mapped via dedicated instance setup |
| Nebius AI | `https://api.tokenfactory.nebius.com/v1/` | |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | |
| OpenRouter | `https://openrouter.ai/api/v1` | |
| LLM Gateway | `https://api.llmgateway.ai/v1` | |
| WisGate | `https://api.wisgate.com/v1` | |
| Requesty.ai | `https://api.requesty.ai/v1` | |
| Inference.net | `https://api.inference.net/v1` | |
| Microsoft Azure AI Foundry | `https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}` | |
| Amazon Bedrock | `Requires orchestration wrapper` | e.g., AWS SDK or LiteLLM |
| Google Cloud Vertex AI | `https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/publishers/google/models/` | |
| IBM watsonx.ai | `Requires mapping endpoints` | Mapped via Cloud Stage Deployment configurations |
| Baseten | `https://inference.baseten.co/v1` | |
| AI21 Labs | `https://api.ai21.com/studio/v1/` | |
| Upstage | `https://api.upstage.ai/v1` | |
| NLP Cloud | `https://api.nlpcloud.com/v1` | |
| Modal | `https://{username}-{app_name}.modal.run/v1` | Generated upon dynamic endpoint launch |
| Hyperbolic | `https://api.hyperbolic.xyz/v1` | |
| Scaleway | `https://api.scaleway.ai/v1` | |
| Cloudflare Workers AI | `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1` | |
| GitHub Models | `https://models.github.ai/inference` | |
| Vercel AI Gateway | `https://gateway.ai.vercel.com/v1` | |
| Ollama | `http://localhost:11434/v1` | Self-hosted local software |
| LocalAI | `http://localhost:8080/v1` | Self-hosted local software |
| vLLM | `http://localhost:8000/v1` | Self-hosted serving framework |
| LM Studio | `http://localhost:1234/v1` | Self-hosted local application |
| Hugging Face | `https://router.huggingface.co/v1` | |

## Tool calling

BrowseCortex is an agent — it always sends tool definitions. Pick a model that
supports tool/function calling. Capability flags come from LiteLLM; for unknown
or local models use **Test capabilities** (Settings → Models) or set the flags
manually.

## Cooldown & fallback

On a 429 the provider enters cooldown (respecting `Retry-After`, else
exponential backoff). Configure a fallback provider per provider so requests
reroute automatically while one is rate-limited.
