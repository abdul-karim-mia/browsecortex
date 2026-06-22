# 🧠 BrowseCortex

**Open source AI browser assistant — Chrome extension · Bring your own AI provider · Full browser control.**

BrowseCortex gives you a persistent AI chat assistant with autonomous browser control. You bring your own AI provider (any OpenAI-compatible API). The AI controls the browser through a rich tool system, manages memory across conversations, handles tasks, and maintains a virtual filesystem.

> ⚠️ **Work in progress.** This repo is being built out from [PLAN.md](PLAN.md). See [TASK.md](TASK.md) for current status.

## Key principles

- **Zero vendor lock-in** — you own your API keys and provider choice
- **OpenAI-compatible** — works with OpenAI, Groq, Together, Mistral, OpenRouter, Ollama, LM Studio, and more
- **Fully autonomous agent** — no hardcoded if/else routing
- **Non-intrusive** — zero repeated permission prompts during tasks
- **Lightweight** — everything loaded on demand
- **Private** — your data never leaves your browser except to the provider you choose

## Monorepo layout

```
packages/
  extension/   ← Chrome extension (Vite + CRXJS + Preact + TypeScript)
  landing/     ← Project landing page (Vite + TypeScript + Vanilla CSS)
  relay/       ← npx browsecortex-relay (Node.js SSE server, MCP bridge)
```

## Development

```bash
npm install          # install all workspaces
npm run dev          # dev build with HMR
npm run build        # production build
npm run typecheck    # type checking
```

Then load `packages/extension/dist` as an unpacked extension in `chrome://extensions` (Developer mode on).

## Support the project

BrowseCortex is an open-source project. If you find it useful or enjoy using it, please consider supporting development!

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/akmia51)

## License

[MIT](LICENSE)
