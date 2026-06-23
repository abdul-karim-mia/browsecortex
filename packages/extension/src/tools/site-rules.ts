/**
 * Per-site tool restrictions (B5). Resolves which tools are blocked for the
 * currently-active tab based on user-configured origin patterns. Enforced in the
 * agent loop before a tool runs.
 */
import type { SiteToolRule } from '@/types';

/** Turn a `*`-wildcard pattern into an anchored, case-insensitive RegExp. */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex metachars…
    .replace(/\*/g, '.*'); // …except the wildcard
  return new RegExp(`^${escaped}$`, 'i');
}

/** Whether `pattern` matches the URL's full form, origin, or hostname. */
export function matchesPattern(pattern: string, url: string): boolean {
  if (!pattern.trim() || !url) return false;
  let origin = url;
  let host = url;
  try {
    const u = new URL(url);
    origin = u.origin;
    host = u.hostname;
  } catch {
    /* non-URL (e.g. chrome://newtab) — fall back to raw string matching */
  }
  const re = patternToRegex(pattern);
  return re.test(url) || re.test(origin) || re.test(host);
}

/** The set of tool names blocked for a given URL across all rules. */
export function blockedToolsForUrl(
  rules: SiteToolRule[] | undefined,
  url: string | undefined,
): Set<string> {
  const blocked = new Set<string>();
  if (!rules?.length || !url) return blocked;
  for (const rule of rules) {
    if (matchesPattern(rule.pattern, url)) {
      for (const tool of rule.blockedTools) blocked.add(tool);
    }
  }
  return blocked;
}
