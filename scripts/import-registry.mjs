#!/usr/bin/env node
/**
 * Import ALL candidate MCP servers from the official registry.
 * Fetches all servers at once (simple, no pagination issues).
 *
 *   node scripts/import-registry.mjs
 *
 * Keeps only REMOTE servers (streamable-http / sse) with "none" or "api_key" auth.
 * Skips local/stdio and OAuth-only servers. Files land in mcp/community/.
 *
 * After importing:
 *   node scripts/build-index.mjs    # regenerate index
 *   node scripts/validate-mcp.mjs   # validate
 *   # Delete unwanted community/*.json files, then rebuild index
 */
import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers';
const OUT_DIR = resolve(process.cwd(), 'mcp', 'community');

console.log(`[LOG] Fetching ALL servers from registry...`);
console.log(`[LOG] Registry URL: ${REGISTRY}`);
console.log(`[LOG] Output dir: ${OUT_DIR}`);

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveRemote(remotes) {
  if (!Array.isArray(remotes)) return null;
  const remote = remotes.find((r) => r.type === 'streamable-http') ?? remotes.find((r) => r.type === 'sse');
  if (!remote) return null;
  const transport = remote.type === 'sse' ? 'sse' : 'streamable_http';
  const headers = Array.isArray(remote.headers) ? remote.headers : [];
  const required = headers.filter((h) => h.isRequired);

  if (required.length === 0) return { url: remote.url, transport, auth: 'none' };

  if (required.length === 1) {
    const h = required[0];
    if (h.isSecret && /^authorization$/i.test(h.name)) {
      return {
        url: remote.url,
        transport,
        auth: 'api_key',
        apiKeyConfig: {
          label: 'API Key / Bearer Token',
          placeholder: 'token...',
          helperText: h.description || 'Token sent as Authorization: Bearer <token>.',
        },
      };
    }
  }
  return null;
}

async function fetchAll() {
  const out = [];
  let cursor = '';
  let iterations = 0;
  const MAX_ITERATIONS = 150; // Safety limit: max 15,000 servers

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const url = `${REGISTRY}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    console.log(`[LOG] Fetching batch ${iterations}... (${out.length} so far)`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();
      out.push(...(json.servers ?? []));
      cursor = json.metadata?.nextCursor;
      console.log(`[LOG] Batch ${iterations}: +${json.servers?.length ?? 0} entries (total: ${out.length})`);
      if (!cursor) {
        console.log(`[LOG] ✓ All pages fetched (no more cursor)`);
        break;
      }
    } catch (e) {
      console.error(`[ERROR] Batch ${iterations} failed: ${e.message}`);
      if (out.length === 0) throw e; // Fatal if we haven't fetched anything yet
      console.log(`[LOG] Continuing with ${out.length} entries already fetched...`);
      break;
    }
  }

  console.log(`[LOG] Total entries from registry: ${out.length}`);
  return out;
}

const entries = await fetchAll();
mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
let skipped = 0;
const seen = new Set();

console.log(`[LOG] Processing ${entries.length} entries...`);
for (let i = 0; i < entries.length; i++) {
  if (i % 500 === 0) console.log(`[LOG] Processed ${i}/${entries.length}...`);

  const wrapper = entries[i];
  const s = wrapper.server ?? wrapper;
  const meta = wrapper._meta?.['io.modelcontextprotocol.registry/official'];
  if (meta && meta.status && meta.status !== 'active') {
    skipped++;
    continue;
  }

  const remote = resolveRemote(s.remotes);
  if (!remote) {
    skipped++;
    continue;
  }

  const id = slug(s.name);
  if (seen.has(id)) continue;
  seen.add(id);

  const namespace = String(s.name).split('/')[0] || 'admin';
  const def = {
    id,
    name: s.title || s.name,
    icon: '',
    description: (s.description || s.name).slice(0, 100),
    longDescription: s.description || '',
    category: 'community',
    tier: 'community',
    version: s.version || '1.0',
    author: namespace || 'admin',
    submittedBy: namespace || 'admin',
    url: remote.url,
    transport: remote.transport,
    docsUrl: s.websiteUrl || s.repository?.url || '',
    auth: remote.auth,
    authFallback: null,
    ...(remote.apiKeyConfig ? { apiKeyConfig: remote.apiKeyConfig } : {}),
    tools: [],
    examplePrompts: [],
  };

  const file = resolve(OUT_DIR, `${id}.json`);
  writeFileSync(file, JSON.stringify(def, null, 2) + '\n');
  written++;
}

const totalFiles = readdirSync(OUT_DIR).length;
console.log(`\n[SUCCESS] Wrote ${written} server(s) to mcp/community/ (skipped ${skipped}, deduplicated).`);
console.log(`Total files in mcp/community/: ${totalFiles}\n`);
console.log(`Next steps:`);
console.log(`  1. Delete unwanted: rm mcp/community/spam-*.json mcp/community/unrelated-*.json ...`);
console.log(`  2. Rebuild index: node scripts/build-index.mjs`);
console.log(`  3. Validate: node scripts/validate-mcp.mjs`);
console.log(`  4. Commit!`);
