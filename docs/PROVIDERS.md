# Providers

BrowseCortex works with any OpenAI-compatible `/chat/completions` endpoint. Add
providers in Settings → Providers; the Base URL field offers one-click presets.

| Provider | Base URL | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier rate-limits the OpenAI endpoint; prefer Flash models or route via OpenRouter |
| Groq | `https://api.groq.com/openai/v1` | Generous free tier, very fast, good tool-calling |
| Cerebras | `https://api.cerebras.ai/v1` | |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | |
| Together AI | `https://api.together.xyz/v1` | |
| Mistral | `https://api.mistral.ai/v1` | |
| Cohere | `https://api.cohere.ai/compatibility/v1` | |
| Perplexity | `https://api.perplexity.ai` | |
| OpenRouter | `https://openrouter.ai/api/v1` | Look for `:free` model ids |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | |
| Deepseek | `https://api.deepseek.com/v1` | |
| xAI (Grok) | `https://api.x.ai/v1` | |
| OpenCode Zen | `https://opencode.ai/zen/v1` | |
| Ollama Cloud | `https://ollama.com/v1` | Needs an API key |
| Ollama (local) | `http://localhost:11434/v1` | Set `OLLAMA_ORIGINS='*'` for the extension |
| LiteLLM (local) | `http://localhost:4000/v1` | |
| LM Studio (local) | `http://localhost:1234/v1` | |
| Jan (local) | `http://localhost:1337/v1` | |

## Tool calling

BrowseCortex is an agent — it always sends tool definitions. Pick a model that
supports tool/function calling. Capability flags come from LiteLLM; for unknown
or local models use **Test capabilities** (Settings → Models) or set the flags
manually.

## Cooldown & fallback

On a 429 the provider enters cooldown (respecting `Retry-After`, else
exponential backoff). Configure a fallback provider per provider so requests
reroute automatically while one is rate-limited.
