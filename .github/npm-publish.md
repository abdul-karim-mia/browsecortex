# NPM Publishing Setup

## Prerequisites

1. Create an NPM account at https://www.npmjs.com/signup
2. Create an automation token: https://www.npmjs.com/settings/~/tokens
   - Scope: Automation
   - Type: Granular Access Token

## GitHub Setup

1. Go to repository Settings → Secrets and variables → Actions
2. Add new repository secret:
   - **Name:** `NPM_TOKEN`
   - **Value:** Your NPM automation token

## Manual Publishing

```bash
cd packages/relay
npm publish --access public
```

## Automatic Publishing

The Release workflow publishes `browsecortex-relay` to npm automatically when:
1. A new tag `v*` is created
2. The workflow completes successfully

## Verify Publication

```bash
npm view browsecortex-relay versions
npm install -g browsecortex-relay
browsecortex-relay --version
```

## Package Details

- **Package:** `browsecortex-relay`
- **Binary:** `browsecortex-relay`
- **Description:** WebSocket↔HTTP/SSE relay for external MCP agents
- **Repository:** https://github.com/abdul-karim-mia/browsecortex

## Unpublish (Rollback)

```bash
npm unpublish browsecortex-relay@VERSION --force
```

⚠️ Can only unpublish versions < 24 hours old.
