# Version History

BrowseCortex follows [Semantic Versioning](https://semver.org/).

## Release Timeline

### v1.1.0

- **Date:** 2026-06-23
- **Status:** Released
- **Highlights:**
  - Security hardening: relay body-size limit, header-based auth tokens,
    timing-safe token comparison, graceful shutdown, CSP on the landing page
  - Agent loop fixes: tool-call name accumulation, content-filter surfacing,
    multimodal token estimation, structured tool-arg parse errors
  - i18n: Unicode-aware memory keyword extraction
  - Version sync across all packages, manifest, and the `VERSION` file
  - See [CHANGELOG.md](CHANGELOG.md) for full details

### v1.0.0 (Initial Release)

- **Date:** 2026-06-21
- **Status:** Released
- **Features:**
  - Streaming agent loop with parallel tool calls
  - 100+ browser tools
  - Memory system, tasks, virtual filesystem
  - Provider/model management
  - Skills system & MCP support
  - Backup & restore
  - i18n foundation
  - See [CHANGELOG.md](CHANGELOG.md) for full details

---

## Version Format

`MAJOR.MINOR.PATCH`

- **MAJOR** — Breaking changes to agent API, storage format, or tool definitions
- **MINOR** — New features, backward compatible
- **PATCH** — Bug fixes, minor improvements

## Release Process

The `release.sh` script updates every version source in one pass:
`package.json`, all `packages/*/package.json`, `packages/extension/manifest.json`,
and the `VERSION` file.

1. Run `npm run release [major|minor|patch]`
2. Review the generated `CHANGELOG.md` entry
3. Push the commit and tag: `git push origin main --follow-tags`
4. Publish relay to npm: `npm publish packages/relay`

### Quick Release

```bash
./scripts/release.sh [major|minor|patch]
```

Or use GitHub Actions: **Workflow Dispatch** on the Release workflow.

## Package Publication

- **Extension:** Distributed via Chrome Web Store (manual upload)
- **Relay:** Published to npm as [`browsecortex-relay`](https://www.npmjs.com/package/browsecortex-relay)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.
