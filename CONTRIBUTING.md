# Contributing to BrowseCortex

Thanks for your interest in contributing! BrowseCortex is open source and
welcomes contributions of all sizes.

## Development setup

```bash
git clone <repo>
cd browsecortex
npm install
npm run build           # build all workspaces
```

To work on the extension:

```bash
cd packages/extension
npm run dev             # Vite dev server with HMR
```

Then load `packages/extension/dist` as an unpacked extension at
`chrome://extensions` (enable Developer mode).

## Quality checks

Before opening a PR, make sure these pass:

```bash
cd packages/extension
npm run typecheck       # tsc --noEmit
npm run test            # vitest
npm run build           # production build
```

## Project layout

- `packages/extension` — the Chrome extension (Vite + CRXJS + Preact + TS)
- `packages/relay` — the optional Node relay for MCP-server mode

Within the extension, the key areas:

- `src/agent` — the agent loop, system prompt, compaction
- `src/tools` — tool definitions + executor
- `src/providers` — OpenAI-compatible client + streaming
- `src/storage`, `src/db` — persistence layer (never bypass the `Storage` facade)
- `src/sidepanel`, `src/settings`, `src/onboarding` — Preact UIs

## Contribution areas

| Area                                    | Barrier                 |
| --------------------------------------- | ----------------------- |
| Translations (`src/i18n`)               | Low — add one JSON file |
| Documentation                           | Low                     |
| New browser tools (`src/tools/builtin`) | Medium                  |
| Bug fixes                               | Medium                  |
| Agent loop / memory / storage           | Core review required    |

## Adding a tool

1. Create a `ToolDefinition` in `src/tools/builtin/`
2. Add it to the relevant export array
3. Register it in `src/tools/registry.ts`
4. Add a unit test

## Conventions

- TypeScript strict mode; no `any` without justification
- Conventional Commits for changelog generation
- Match the style of surrounding code
