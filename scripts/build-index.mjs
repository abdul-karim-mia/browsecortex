#!/usr/bin/env node
/**
 * Regenerate mcp/index.json from the per-server JSON files on disk
 * (MCP_DIRECTORY_PLAN). Run after adding, editing, or deleting any server
 * file — the index is a derived artifact, so deleting a file is all it takes
 * to remove a server from the directory.
 *
 *   node scripts/build-index.mjs
 *
 * Popularity: a server file may set an optional numeric `popularity`; otherwise
 * the value from the existing index.json is preserved, else 0. Featured servers
 * are listed first, ordered by popularity ascending (1 = most popular).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'mcp');
const INDEX = resolve(ROOT, 'index.json');

// Preserve any popularity values already chosen in the current index.
const prior = new Map();
if (existsSync(INDEX)) {
  try {
    const cur = JSON.parse(readFileSync(INDEX, 'utf8'));
    for (const e of cur.servers ?? []) prior.set(e.id, e.popularity);
  } catch {
    /* ignore malformed existing index */
  }
}

function collect(dir) {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const def = JSON.parse(readFileSync(resolve(abs, f), 'utf8'));
      const popularity =
        typeof def.popularity === 'number'
          ? def.popularity
          : (prior.get(def.id) ?? (def.tier === 'featured' ? 999 : 0));
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon || undefined,
        category: def.category,
        tier: def.tier,
        popularity,
        path: `${dir}/${f}`,
      };
    });
}

const featured = collect('featured').sort(
  (a, b) => a.popularity - b.popularity || a.name.localeCompare(b.name),
);
const community = collect('community').sort((a, b) => a.name.localeCompare(b.name));

const index = {
  version: '1.0',
  updated: new Date().toISOString(),
  servers: [...featured, ...community],
};

writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n');
console.log(
  `Wrote mcp/index.json — ${featured.length} featured, ${community.length} community.`,
);
