# 🔌 BrowseCortex Relay

WebSocket ↔ HTTP/SSE relay server that allows external MCP agents to control BrowseCortex.

## What is BrowseCortex Relay?

BrowseCortex Relay is a Node.js server that bridges external AI agents (running via MCP protocol) with a BrowseCortex extension instance. It provides:

- **WebSocket Server** — Receives browser control commands from BrowseCortex
- **HTTP/SSE Server** — Serves tool definitions and handles MCP requests from external agents
- **Message Relay** — Forwards tool calls between the browser and external agents

## Installation

```bash
npm install -g browsecortex-relay
```

## Quick Start

### 1. Start the relay server

```bash
browsecortex-relay
```

Server runs on:
- **WebSocket:** `ws://localhost:3001`
- **HTTP/SSE:** `http://localhost:3000`

### 2. Connect BrowseCortex extension

In BrowseCortex Settings → MCP → Relay:
- Enable "Use Relay Mode"
- WebSocket URL: `ws://localhost:3001`

### 3. Connect external MCP agent

Your MCP client can now:
- Fetch available tools from `http://localhost:3000/tools`
- Call tools via HTTP POST `/tool-call`
- Receive browser events via Server-Sent Events (SSE)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP/SSE server port |
| `WS_PORT` | `3001` | WebSocket server port |
| `HOST` | `localhost` | Server host/IP |

### Example with custom ports

```bash
PORT=8000 WS_PORT=8001 browsecortex-relay
```

## Architecture

```
┌─────────────────────┐
│ External MCP Agent  │
│ (Claude, etc.)      │
└──────────┬──────────┘
           │
           │ HTTP/SSE
           ▼
┌─────────────────────┐
│  BrowseCortex Relay │
│  Server             │
└─────────┬───────────┘
          │
          │ WebSocket
          ▼
┌─────────────────────┐
│ BrowseCortex        │
│ Chrome Extension    │
└─────────────────────┘
```

## API Reference

### HTTP Endpoints

#### Get Available Tools
```bash
GET http://localhost:3000/tools
```

Returns a list of all browser control tools available through BrowseCortex.

**Response:**
```json
{
  "tools": [
    {
      "name": "navigate",
      "description": "Navigate to a URL",
      "inputSchema": { ... }
    },
    ...
  ]
}
```

#### Call a Tool
```bash
POST http://localhost:3000/tool-call
Content-Type: application/json

{
  "tool": "navigate",
  "input": {
    "url": "https://example.com"
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": "Navigated to https://example.com"
}
```

### WebSocket Events

BrowseCortex sends events to the relay via WebSocket:

```
message: {
  type: "tool_result",
  toolName: "string",
  result: "any",
  error?: "string"
}
```

### Server-Sent Events (SSE)

External agents can subscribe to browser events:

```bash
curl http://localhost:3000/events
```

Receives events like:
```
event: page_load
data: {"url": "https://example.com"}

event: tab_created
data: {"tabId": 123}
```

## Use Cases

### 1. Remote Browser Control
Control a browser from a remote server or different network.

### 2. Multi-Agent Coordination
Multiple MCP agents can share browser access through a single relay.

### 3. Cloud AI Integration
Run AI agents in the cloud while controlling a local browser.

### 4. Testing & Automation
Use BrowseCortex tools in automated testing pipelines.

## Security Considerations

⚠️ **Important:** BrowseCortex Relay should NOT be exposed to the public internet without authentication.

### Recommended Setup

- **Local Network Only:** Use relay within your trusted network
- **VPN/SSH Tunnel:** For remote access, use a secure tunnel
- **Firewall:** Restrict access to relay ports
- **Authentication:** Add auth layer (reverse proxy, API key, etc.)

Example with SSH tunnel:
```bash
# On remote machine
ssh -R 3000:localhost:3000 -R 3001:localhost:3001 user@local-machine

# Then connect locally
browsecortex-relay
```

## Troubleshooting

### "Cannot find module" error
Make sure you installed globally:
```bash
npm install -g browsecortex-relay
```

Or use `npx`:
```bash
npx browsecortex-relay
```

### WebSocket connection refused
1. Check relay is running: `curl http://localhost:3000/tools`
2. Check firewall allows port 3001
3. Verify WebSocket URL in BrowseCortex settings

### Tools not available
1. Make sure BrowseCortex is connected to relay via WebSocket
2. Check browser console for errors
3. Restart relay and BrowseCortex

## Development

### Build from source

```bash
git clone https://github.com/abdul-karim-mia/browsecortex
cd packages/relay
npm install
npm run build
npm start
```

### Development mode with file watching

```bash
npm run dev
```

## License

MIT — See [LICENSE](../../LICENSE)

## Support

- **Issues:** https://github.com/abdul-karim-mia/browsecortex/issues
- **Security:** See [SECURITY.md](../../.github/SECURITY.md)
- **Contributing:** See [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

**Part of [BrowseCortex](https://github.com/abdul-karim-mia/browsecortex)** — Open source AI browser assistant.
