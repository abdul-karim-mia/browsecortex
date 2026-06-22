# Changelog

All notable changes to BrowseCortex are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added


## [1.1.1] - 2026-06-22

### Added

## [1.1.0] - 2026-06-23

### Fixed

- Relay server denial-of-service vector — `/messages` now enforces a 1 MB body limit.
- Auth tokens no longer travel in URL query strings: HTTP uses `Authorization: Bearer`,
  the extension WebSocket uses the `token.<value>` sub-protocol. Token comparison is
  constant-time.
- Relay resource leaks: pending RPCs are drained on extension disconnect/replacement,
  SSE writes are guarded against destroyed responses, and WebSocket/HTTP/WSS errors are
  handled (including `EADDRINUSE`).
- `run_javascript` now runs in the ISOLATED world, shrinking the blast radius of a
  prompt-injected script.
- Streaming tool-call names no longer accumulate across SSE chunks (fixes doubled names
  like `click_elementclick_element`).
- Provider `content_filter` finish reason is surfaced to the user instead of being
  silently treated as a normal completion.
- Malformed tool-call JSON is reported back to the model instead of silently passing `{}`.
- Token estimation counts multimodal/image content so compaction triggers for
  image-heavy conversations.
- Memory keyword extraction is Unicode-aware (non-Latin scripts are no longer dropped).
- `fs_export` uses correct UTF-8 base64 encoding (no more corrupted emoji/supplementary
  characters).
- `ask_user` promise no longer leaks when the side panel disconnects mid-question.
- Four-way version desync resolved — all packages, the manifest, and `VERSION` are 1.1.0.

### Added

- Content Security Policy and accessibility (ARIA, mobile menu, reduced-motion) on the
  landing page.
- Graceful shutdown (SIGINT/SIGTERM) for the relay server.
- Timeouts on the MCP client and vision fallback requests.
- Configurable compaction `keepRecent`, cached memory search index, parallel image
  analysis.
- Relay unit tests, an accurate relay README, and CORS handling.

## [1.0.5] - 2026-06-21

### Added

- Incremental bugfixes and stability improvements.

## [1.0.1] - 2026-06-21

### Added

- Monorepo scaffold (extension + relay) with Vite, CRXJS, Preact, Tailwind v4.
- Streaming agent loop with parallel tool calls, iteration cap, and abort.
- 100+ browser tools: tabs, navigation, page read/interaction, waits, windows,
  cookies, tab groups, sessions, reading list, search, media, storage, and more.
- Memory (Fuse.js), tasks, and a per-conversation virtual filesystem.
- Provider/model management with LiteLLM capability enrichment + ping test.
- Provider cooldown & fallback routing on 429.
- Skills system (marketplace + custom editor), MCP client, and
  BrowseCortex-as-MCP-server via the relay.
- File attachments (images → vision, text folded in), vision fallback.
- Context compaction, message pinning, conversation drawer with filters.
- Backup & restore (AES-256-GCM) with full/merge/selective modes and the
  create_backup tool; local auto-backup snapshots.
- Notifications with per-event toggles, error boundaries, i18n foundation,
  storage-quota handling, session checkpointing, and keyboard shortcuts.
- SVG icon set and branded extension icons.

[Unreleased]: https://github.com/abdul-karim-mia/browsecortex/compare/v1.1.1...HEAD/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/abdul-karim-mia/browsecortex/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/abdul-karim-mia/browsecortex/compare/v1.0.1...v1.0.5
[1.0.1]: https://github.com/abdul-karim-mia/browsecortex/releases/tag/v1.0.1
