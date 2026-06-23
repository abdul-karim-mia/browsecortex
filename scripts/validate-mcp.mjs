#!/usr/bin/env node
/**
 * Validate the MCP directory (MCP_DIRECTORY_PLAN §12 automated checks).
 * Run from the repo root: `node scripts/validate-mcp.mjs`.
 *
 * Checks:
 *  - index.json is well-formed and every entry has the required fields
 *  - each entry's `path` resolves to a JSON file that parses
 *  - per-server `id` matches its index id and filename
 *  - required per-server fields are present and auth config is coherent
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

const ROOT = resolve(process.cwd(), 'mcp');
const CATEGORIES = ['code', 'communication', 'data', 'design', 'productivity', 'local', 'community'];
const TIERS = ['featured', 'community'];
const AUTH = ['oauth', 'api_key', 'none'];
const TRANSPORTS = ['streamable_http', 'sse', 'stdio'];

const errors = [];
const fail = (m) => errors.push(m);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`${path}: invalid JSON — ${e.message}`);
    return null;
  }
}

const index = readJson(resolve(ROOT, 'index.json'));
const entries = index && (Array.isArray(index) ? index : index.servers);
if (!Array.isArray(entries)) {
  fail('index.json has no servers array.');
} else {
  const seen = new Set();
  for (const e of entries) {
    for (const field of ['id', 'name', 'description', 'category', 'tier', 'popularity', 'path']) {
      if (e[field] === undefined || e[field] === null) fail(`index entry "${e.id}" missing ${field}`);
    }
    if (seen.has(e.id)) fail(`duplicate index id: ${e.id}`);
    seen.add(e.id);
    if (!CATEGORIES.includes(e.category)) fail(`entry "${e.id}" bad category: ${e.category}`);
    if (!TIERS.includes(e.tier)) fail(`entry "${e.id}" bad tier: ${e.tier}`);

    const def = readJson(resolve(ROOT, e.path));
    if (!def) continue;
    if (def.id !== e.id) fail(`${e.path}: id "${def.id}" != index id "${e.id}"`);
    if (basename(e.path, '.json') !== def.id)
      fail(`${e.path}: filename does not match id "${def.id}"`);
    if (!TIERS.includes(def.tier)) fail(`${e.path}: bad tier`);
    if (!AUTH.includes(def.auth)) fail(`${e.path}: bad auth "${def.auth}"`);
    if (!TRANSPORTS.includes(def.transport)) fail(`${e.path}: bad transport "${def.transport}"`);
    for (const field of ['name', 'description', 'category', 'version', 'author', 'url', 'tools']) {
      if (def[field] === undefined || def[field] === null) fail(`${e.path}: missing ${field}`);
    }
    // tools may be empty — registry-imported servers fetch their real tool
    // list live on connect; the array here is only a detail-page preview.
    if (!Array.isArray(def.tools)) fail(`${e.path}: tools must be an array`);
    else if (def.tools.length > 100) fail(`${e.path}: too many tools (>100)`);
    if (def.auth === 'oauth' && !def.oauthConfig) fail(`${e.path}: auth oauth requires oauthConfig`);
    if (def.auth === 'api_key' && !def.apiKeyConfig)
      fail(`${e.path}: auth api_key requires apiKeyConfig`);
  }
}

if (errors.length) {
  console.error(`MCP directory validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log(`MCP directory OK — ${entries?.length ?? 0} servers validated.`);
