# Contributors to BrowseCortex

## How to contribute

BrowseCortex is an open source project and welcomes contributions from everyone. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Contribution levels

| Level | Examples |
|-------|----------|
| **Translations** | Adding i18n translations, low barrier to entry |
| **Documentation** | README, guides, API docs, examples |
| **Tools** | New browser control tools (`src/tools/builtin`) |
| **Bug fixes** | Fixes to existing functionality |
| **Core** | Agent loop, memory, storage — requires design review |

## Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes following [conventions](CONTRIBUTING.md#conventions)
4. Run quality checks: `npm run typecheck && npm run test && npm run build`
5. Open a PR with a clear description
6. Address review feedback
7. Merge when approved

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

**Note:** This file tracks contributions. For acknowledgments and credits, see individual commit messages and PR histories on GitHub.
