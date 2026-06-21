# Version History

BrowseCortex follows [Semantic Versioning](https://semver.org/).

## Release Timeline

### v1.0.0 (Initial Release)
- **Date:** TBD
- **Status:** In Development
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

1. Update versions in `package.json` and `packages/*/package.json`
2. Update `CHANGELOG.md` with release notes
3. Create git tag `v{VERSION}`
4. Push to GitHub and create release
5. Publish relay to npm: `npm publish packages/relay`

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
