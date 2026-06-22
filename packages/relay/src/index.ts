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
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';

interface Options {
  port: number;
  token: string;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { port: 7822, token: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') opts.port = Number(argv[++i]);
    else if (argv[i] === '--token') opts.token = argv[++i] ?? '';
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
    const reply = (result: Json) =>
      res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id, result })}\n\n`);
    const fail = (code: number, message: string) =>
      res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n\n`);

    try {
      switch (msg.method) {
        case 'initialize':
          reply({
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'browsecortex', version: '1.0.0' },
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
    const authed =
      req.headers.authorization === `Bearer ${token}` || url.searchParams.get('token') === token;

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
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
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
      req.on('data', (c) => (body += c));
      req.on('end', async () => {
        try {
          await handleRpc(JSON.parse(body) as Json, res2);
          res.writeHead(202).end('Accepted');
        } catch {
          res.writeHead(400).end('Bad request');
        }
      });
      return;
    }

    if (url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ extensionConnected: extension !== null }));
      return;
    }

    res.writeHead(404).end('Not found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket, req) => {
    const auth = new URL(req.url ?? '/', `http://localhost:${port}`).searchParams.get('token');
    if (auth !== token) return void socket.close(1008, 'Unauthorized');
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

    socket.on('close', () => {
      if (extension === socket) extension = null;
      console.log('Extension disconnected.');
    });
  });

  server.listen(port, () => {
    console.log(`BrowseCortex relay listening on http://localhost:${port}`);
    console.log(`  MCP SSE endpoint: http://localhost:${port}/sse`);
    console.log(`  Extension WS:     ws://localhost:${port}/ws?token=…`);
  });
}

main();
