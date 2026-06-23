# MCP

BrowseCortex speaks the Model Context Protocol in both directions.

## Consuming MCP servers

Connect BrowseCortex to external MCP servers; their tools appear alongside the
built-in browser tools.

- **HTTP/SSE servers** work natively. Add the URL in Settings → MCP
  (e.g. `http://localhost:3000/sse`), with an optional bearer token.
- Tools are namespaced `mcp__<server>__<tool>` to avoid conflicts.
- Toggle servers and individual tools on/off; live status is shown per server.

## BrowseCortex as an MCP server

External agents (Claude Code, any MCP client) can drive this browser through a
lightweight relay. Enable it in Settings → **MCP Server** (off by default).

```bash
npx browsecortex-relay --port 7822 --token <your-token>
```

Then point your agent at `http://localhost:7822/sse`. The extension connects to
the relay over WebSocket; the relay exposes the MCP SSE transport.

### Tools exposed

- All built-in browser tools (filtered by the tool-access policy: all / safe /
  custom).
- `use_agent` — give a natural-language instruction; BrowseCortex's agent plans
  and executes autonomously and returns the result.

### Security

- Disabled by default; localhost only; auth token required.
- "Safe tools only" blocks destructive tools and `run_javascript` for external
  agents.
- Regenerate the token any time from the settings tab.
