#!/usr/bin/env node
/**
 * BrowseCortex relay (PLAN §21).
 *
 * Chrome extensions can't run an HTTP server, so this lightweight Node process
 * bridges the gap: the extension connects over WebSocket, external MCP agents
 * connect over HTTP/SSE (the standard MCP SSE transport). JSON-RPC requests
 * from agents are forwarded to the extension and the responses relayed back.
 *
 *   npx browsecortex-relay --port 7822 --token <token>
 *
 * Implements the MCP methods initialize / tools/list / tools/call by proxying
 * to the extension's tool registry and agent loop over the WebSocket link.
 *
 * Auth: agents send `Authorization: Bearer <token>` (the legacy `?token=`
 * query param is still accepted for backwards compatibility). The extension
 * authenticates the WebSocket via the `token.<value>` sub-protocol, falling
 * back to the legacy `?token=` query param.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

interface Options {
  port: number;
  token: string;
}

const MAX_BODY = 1_048_576; // 1MB cap on POST bodies — prevents OOM DoS.

/** Read the package version so /status and initialize report the real value. */
function pkgVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSION = pkgVersion();

/** Validate a port string is an integer in [1, 65535]. Returns null if invalid. */
export function validatePort(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const p = Number(raw);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return null;
  return p;
}

/** Constant-time token comparison to avoid timing side-channels. */
export function tokenMatches(candidate: string, token: string): boolean {
  if (!candidate || candidate.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { port: 7822, token: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') {
      if (i + 1 >= argv.length) {
        console.error('Error: --port requires a value.');
        process.exit(1);
      }
      const p = validatePort(argv[++i]);
      if (p === null) {
        console.error('Error: --port must be an integer between 1 and 65535.');
        process.exit(1);
      }
      opts.port = p;
    } else if (argv[i] === '--token') {
      if (i + 1 >= argv.length) {
        console.error('Error: --token requires a value.');
        process.exit(1);
      }
      opts.token = argv[++i];
    }
  }
  if (!opts.token) {
    console.error('Error: --token is required.');
    process.exit(1);
  }
  return opts;
}

type Json = Record<string, unknown>;

function main() {
  const { port, token } = parseArgs(process.argv.slice(2));

  // The single connected extension socket (one browser per relay for v1).
  let extension: WebSocket | null = null;
  // Pending RPCs awaiting an extension reply, keyed by id.
  const pending = new Map<string, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
  // Open SSE agent sessions, keyed by sessionId.
  const sessions = new Map<string, ServerResponse>();

  /** Reject and clear every pending RPC (used on disconnect / shutdown). */
  function drainPending(reason: string) {
    for (const [id, p] of pending) {
      p.reject(new Error(reason));
      pending.delete(id);
    }
  }

  /** Send an RPC to the extension and await its result (30s timeout). */
  function callExtension(method: string, params: Json): Promise<Json> {
    return new Promise((resolve, reject) => {
      if (!extension) return reject(new Error('Extension not connected'));
      const id = randomUUID();
      pending.set(id, { resolve, reject });
      extension.send(JSON.stringify({ type: 'rpc', id, method, params }));
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error('Extension RPC timed out'));
      }, 30_000);
    });
  }

  /** Handle one JSON-RPC message from an MCP agent; push the reply over SSE. */
  async function handleRpc(msg: Json, res: ServerResponse): Promise<void> {
    const id = msg.id ?? null;
    const reply = (result: Json) => {
      if (res.destroyed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`);
    };
    const fail = (code: number, message: string) => {
      if (res.destroyed || res.writableEnded) return;
      res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n\n`);
    };

    try {
      switch (msg.method) {
        case 'initialize':
          reply({
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'browsecortex', version: VERSION },
          });
          return;
        case 'notifications/initialized':
        case 'ping':
          if (id !== null) reply({});
          return;
        case 'tools/list':
          reply(await callExtension('list_tools', {}));
          return;
        case 'tools/call':
          reply(await callExtension('call_tool', (msg.params as Json) ?? {}));
          return;
        default:
          fail(-32601, `Method not found: ${String(msg.method)}`);
      }
    } catch (e) {
      fail(-32000, e instanceof Error ? e.message : String(e));
    }
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const authHeader = req.headers.authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const queryToken = url.searchParams.get('token') ?? '';
    const authed = tokenMatches(bearer, token) || tokenMatches(queryToken, token);

    // CORS — relay is localhost-only; reflect origin so browser MCP agents work.
    const origin = req.headers.origin;
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    // MCP SSE transport: agent opens this stream, then POSTs to /messages.
    if (url.pathname === '/sse') {
      if (!authed) return void res.writeHead(401).end('Unauthorized');
      const sessionId = randomUUID();
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      sessions.set(sessionId, res);
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
      const ping = setInterval(() => {
        if (!res.destroyed) res.write(': ping\n\n');
      }, 25_000);
      res.on('error', () => {}); // suppress writes to a torn-down socket
      req.on('close', () => {
        clearInterval(ping);
        sessions.delete(sessionId);
      });
      return;
    }

    // Agent posts JSON-RPC here; the reply streams back over the SSE channel.
    if (url.pathname === '/messages' && req.method === 'POST') {
      if (!authed) return void res.writeHead(401).end('Unauthorized');
      const res2 = sessions.get(url.searchParams.get('sessionId') ?? '');
      if (!res2) return void res.writeHead(404).end('Unknown session');
      let body = '';
      let aborted = false;
      req.on('data', (c) => {
        body += c;
        if (body.length > MAX_BODY) {
          aborted = true;
          if (!res.headersSent) res.writeHead(413).end('Payload too large');
          req.destroy();
        }
      });
      req.on('end', async () => {
        if (aborted) return;
        try {
          await handleRpc(JSON.parse(body) as Json, res2);
          if (!res.headersSent) res.writeHead(202).end('Accepted');
        } catch {
          if (!res.headersSent) res.writeHead(400).end('Bad request');
        }
      });
      return;
    }

    if (url.pathname === '/status') {
      if (!authed) return void res.writeHead(401).end('Unauthorized');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          extensionConnected: extension !== null,
          sessions: sessions.size,
          version: VERSION,
        }),
      );
      return;
    }

    res.writeHead(404).end('Not found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket, req) => {
    // Prefer the `token.<value>` sub-protocol; fall back to legacy `?token=`.
    const proto = (req.headers['sec-websocket-protocol'] ?? '').toString();
    const subToken = proto
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('token.'));
    const wsToken = subToken
      ? subToken.slice('token.'.length)
      : (new URL(req.url ?? '/', `http://localhost:${port}`).searchParams.get('token') ?? '');
    if (!tokenMatches(wsToken, token)) return void socket.close(1008, 'Unauthorized');

    // Replace any prior extension cleanly: close it and fail its pending RPCs.
    if (extension && extension !== socket) {
      extension.close(1000, 'Replaced by new connection');
      drainPending('Extension replaced');
    }
    extension = socket;
    console.log('Extension connected.');

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as Json;
        if (msg.type === 'rpc_result' || msg.type === 'rpc_error') {
          const p = pending.get(String(msg.id));
          if (!p) return;
          pending.delete(String(msg.id));
          if (msg.type === 'rpc_error') p.reject(new Error(String(msg.error)));
          else p.resolve((msg.result as Json) ?? {});
        }
      } catch {
        /* ignore malformed */
      }
    });

    socket.on('error', (err) => console.error('[relay] WS error:', err.message));

    socket.on('close', () => {
      if (extension === socket) {
        extension = null;
        drainPending('Extension disconnected');
      }
      console.log('Extension disconnected.');
    });
  });

  wss.on('error', (err) => console.error('[relay] WSS error:', err.message));

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[relay] Server error:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use.`);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`BrowseCortex relay v${VERSION} listening on http://localhost:${port}`);
    console.log(`  MCP SSE endpoint: http://localhost:${port}/sse`);
    console.log(`  Extension WS:     ws://localhost:${port}/ws`);
  });

  // Graceful shutdown: drain SSE sessions, close the extension link, stop servers.
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[relay] Shutting down…');
    for (const [, res] of sessions) {
      if (!res.destroyed) res.end();
    }
    sessions.clear();
    extension?.close(1000, 'Server shutting down');
    drainPending('Server shutting down');
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, shutdown);
  }
}

// Only start the server when run as the CLI entry point — not when imported
// (e.g. by unit tests), which would otherwise exit for the missing token.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
