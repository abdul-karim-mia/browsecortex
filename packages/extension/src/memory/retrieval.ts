/**
 * Memory retrieval via fuzzy keyword search (PLAN §12).
 * Fuse.js over memory content — no extra API calls, no added latency.
 */
import Fuse from 'fuse.js';
import { Storage } from '@/storage';
import type { Memory } from '@/types';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'i',
  'you',
  'it',
  'this',
  'that',
  'my',
  'me',
  'do',
  'can',
  'please',
  'how',
  'what',
  'why',
]);

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Returns the top-N memories relevant to a user message. Returns [] when no
 * memories exist or nothing matches (agent proceeds without them, PLAN §12).
 */
export async function retrieveMemories(message: string, limit = 5): Promise<Memory[]> {
  const all = await Storage.memories.list();
  if (all.length === 0) return [];

  const keywords = extractKeywords(message);
  if (keywords.length === 0) return [];

  const fuse = new Fuse(all, {
    keys: ['content', 'keywords'],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
  });

  const results = fuse.search(keywords.join(' '));
  return results.slice(0, limit).map((r) => r.item);
}
