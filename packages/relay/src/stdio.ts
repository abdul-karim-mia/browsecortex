#!/usr/bin/env node
/**
 * BrowseCortex MCP stdio bridge.
 *
 * A zero-config entry for MCP clients that launch a command (Claude Desktop,
 * Cursor, VS Code). It speaks MCP over stdio and forwards every JSON-RPC
 * message to the local relay's StreamableHTTP endpoint, auto-spawning the relay
 * as a detached background process if it isn't already running. The spawned
 * relay is given a short idle timeout so it cleans itself up once this bridge
 * and the browser both go away.
 *
 *   npx browsecortex-mcp --port 7822 --token <token>
 *
 * Client config (e.g. Claude Desktop):
 *   { "command": "npx", "args": ["browsecortex-mcp", "--token", "<token>"] }
 *
 * All diagnostics go to stderr — stdout is reserved for the newline-delimited
 * JSON-RPC stream the MCP client reads.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './index.js';

const { port, token } = parseArgs(process.argv.slice(2));
const BASE = `http://localhost:${port}`;
const HEALTH_URL = `${BASE}/health`;
const MCP_URL = `${BASE}/mcp`;
const SPAWN_IDLE_SEC = 30; // relay self-terminates 30s after we + the browser leave
const MAX_SPAWN_WAIT_MS = 8000;
const RPC_TIMEOUT_MS = 120_000;

type Json = Record<string, unknown>;

function log(msg: string): void {
  process.stderr.write(`[browsecortex-mcp] ${msg}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function relayAlive(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnRelay(): void {
  const relayPath = join(dirname(fileURLToPath(import.meta.url)), 'index.js');
  log(`Starting relay on port ${port} (idle-timeout ${SPAWN_IDLE_SEC}s)…`);
  const child = spawn(
    process.execPath,
    [
      relayPath,
      '--port',
      String(port),
      '--token',
      token,
      '--idle-timeout',
      String(SPAWN_IDLE_SEC),
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.on('error', (err) => log(`Failed to spawn relay: ${err.message}`));
  child.unref(); // don't keep this bridge alive on the relay's behalf
}

/** Ensure a relay is reachable, spawning one if needed. Returns false if it never came up. */
async function ensureRelay(): Promise<boolean> {
  if (await relayAlive()) return true;
  spawnRelay();
  const deadline = Date.now() + MAX_SPAWN_WAIT_MS;
  let delay = 200;
  while (Date.now() < deadline) {
    await sleep(delay);
    if (await relayAlive()) return true;
    delay = Math.min(delay * 1.5, 1000);
  }
  return false;
}

/** Forward one JSON-RPC message to the relay; resolve with the reply (or null for notifications). */
async function forward(msg: Json): Promise<Json | null> {
  const id = msg.id ?? null;
  const errorReply = (message: string): Json | null =>
    id === null ? null : { jsonrpc: '2.0', id, error: { code: -32000, message } };
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (res.status === 202) return null; // notification — no reply
    if (!res.ok) return errorReply(`Relay returned HTTP ${res.status}`);
    return (await res.json()) as Json;
  } catch (e) {
    return errorReply(e instanceof Error ? e.message : String(e));
  }
}

function writeMessage(obj: Json): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function main(): Promise<void> {
  if (!(await ensureRelay())) {
    log(
      'Could not reach or start the relay. Is the BrowseCortex extension installed ' +
        'and its MCP server enabled with this port and token?',
    );
  }

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    // Messages are newline-delimited JSON (MCP stdio transport).
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: Json;
      try {
        msg = JSON.parse(line) as Json;
      } catch {
        continue; // skip unparseable lines
      }
      // Responses are matched by id on the client, so out-of-order is fine.
      void forward(msg).then((out) => {
        if (out) writeMessage(out);
      });
    }
  });
  process.stdin.on('close', () => process.exit(0));
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
