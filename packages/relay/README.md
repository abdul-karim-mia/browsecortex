# 🔌 BrowseCortex Relay

WebSocket ↔ HTTP/SSE relay that lets external MCP agents drive a running
BrowseCortex extension.

## What it does

Chrome extensions can't run an HTTP server, so this lightweight Node process
bridges the gap:

- **WebSocket link** — the BrowseCortex extension connects to `/ws` and answers
  JSON-RPC requests (`list_tools`, `call_tool`).
- **MCP SSE transport** — external agents open an SSE stream at `/sse`, then POST
  JSON-RPC messages to `/messages`. Requests are proxied to the extension and the
  responses streamed back.

Only one extension connects per relay (v1).

## Installation

```bash
npm install -g browsecortex-relay
# or run ad-hoc:
npx browsecortex-relay --token <token>
```

## Quick start

```bash
browsecortex-relay --port 7822 --token <your-shared-secret>
```

The server prints:

```
BrowseCortex relay v1.1.0 listening on http://localhost:7822
  MCP SSE endpoint: http://localhost:7822/sse
  Extension WS:     ws://localhost:7822/ws
```

In **BrowseCortex Settings → MCP → Relay**, enable relay mode and enter the same
port and token.

## CLI arguments

| Argument          | Default | Description                          |
| ----------------- | ------- | ------------------------------------ |
| `--port <n>`      | `7822`  | HTTP + WebSocket port (1–65535)      |
| `--token <value>` | —       | Shared auth secret (**required**)    |

There are no environment variables and no separate WebSocket port — HTTP and
WebSocket share the same port.

## Authentication

All endpoints require the token.

- **HTTP agents** send `Authorization: Bearer <token>`. A legacy `?token=<token>`
  query parameter is still accepted for backwards compatibility but is
  discouraged (tokens in URLs leak into logs).
- **The extension WebSocket** authenticates via the `token.<value>`
  WebSocket sub-protocol (falling back to `?token=` for older builds).

Token comparison is constant-time.

## HTTP API

| Method | Path        | Auth | Description                                            |
| ------ | ----------- | ---- | ----------------------------------------------------- |
| `GET`  | `/sse`      | yes  | Open the MCP SSE stream; returns the `/messages` URL. |
| `POST` | `/messages?sessionId=…` | yes | Send a JSON-RPC message (1 MB body cap). Reply streams over SSE. |
| `GET`  | `/status`   | yes  | `{ extensionConnected, sessions, version }`.          |

Supported JSON-RPC methods: `initialize`, `ping`, `notifications/initialized`,
`tools/list`, `tools/call`.

## Security

The relay is intended for **localhost use only**. Do not expose it to the public
internet. For remote access, use an SSH tunnel or VPN:

```bash
ssh -L 7822:localhost:7822 user@host
```

## Development

```bash
cd packages/relay
npm install
npm run build      # tsc → dist/
npm run typecheck
npm test           # vitest
RELAY_DEV_TOKEN=dev npm run dev   # watch mode
```

## License

MIT — see [LICENSE](../../LICENSE).
