/**
 * Provider cooldown & fallback (PLAN §40).
 *
 * On a 429 a provider is put into cooldown: respect a Retry-After header when
 * present, otherwise exponential backoff (5s → 15s → 60s → 5min). Repeated 429s
 * while still cooling double the remaining time and mark the provider degraded.
 * State lives in chrome.storage.session so it resets when the browser closes.
 *
 * The pure backoff math (`nextCooldown`) is exported for unit testing.
 */

export type CooldownState = 'active' | 'cooling_down' | 'degraded';

export interface Cooldown {
  providerId: string;
  /** Epoch ms when the cooldown expires. */
  until: number;
  /** Backoff step index reached so far. */
  level: number;
  state: CooldownState;
}

const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];
const KEY = 'provider_cooldowns';

// In-memory fallback when chrome.storage.session is unavailable (tests).
const memory = new Map<string, Cooldown>();

function hasSession(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.session;
}

async function readAll(): Promise<Record<string, Cooldown>> {
  if (hasSession()) {
    const res = await chrome.storage.session.get(KEY);
    return (res[KEY] as Record<string, Cooldown>) ?? {};
  }
  return Object.fromEntries(memory);
}

async function writeAll(all: Record<string, Cooldown>): Promise<void> {
  if (hasSession()) {
    await chrome.storage.session.set({ [KEY]: all });
    return;
  }
  memory.clear();
  for (const [k, v] of Object.entries(all)) memory.set(k, v);
}

/**
 * Compute the next cooldown given the previous one (or null) and an optional
 * Retry-After value in seconds. Pure — `now` is injected for testing.
 */
export function nextCooldown(
  providerId: string,
  prev: Cooldown | null,
  retryAfterSec: number | null,
  now: number,
): Cooldown {
  const coolingNow = prev !== null && now < prev.until;

  if (retryAfterSec != null && retryAfterSec > 0) {
    return {
      providerId,
      until: now + retryAfterSec * 1000,
      level: prev?.level ?? 0,
      state: coolingNow ? 'degraded' : 'cooling_down',
    };
  }

  if (coolingNow) {
    // Another 429 while still cooling — double the remaining time (PLAN §40).
    const remaining = prev.until - now;
    return {
      providerId,
      until: now + remaining * 2,
      level: Math.min((prev?.level ?? 0) + 1, BACKOFF_MS.length - 1),
      state: 'degraded',
    };
  }

  const level = prev ? Math.min(prev.level + 1, BACKOFF_MS.length - 1) : 0;
  return { providerId, until: now + BACKOFF_MS[level], level, state: 'cooling_down' };
}

/** Record a 429 for a provider and persist the resulting cooldown. */
export async function recordRateLimit(
  providerId: string,
  retryAfterSec: number | null,
): Promise<Cooldown> {
  const all = await readAll();
  const next = nextCooldown(providerId, all[providerId] ?? null, retryAfterSec, Date.now());
  all[providerId] = next;
  await writeAll(all);
  return next;
}

/** Remaining cooldown in ms for a provider, or 0 if active. */
export async function remainingMs(providerId: string): Promise<number> {
  const all = await readAll();
  const cd = all[providerId];
  if (!cd) return 0;
  return Math.max(0, cd.until - Date.now());
}

export async function isCoolingDown(providerId: string): Promise<boolean> {
  return (await remainingMs(providerId)) > 0;
}

export async function getCooldown(providerId: string): Promise<Cooldown | null> {
  return (await readAll())[providerId] ?? null;
}

/** Manually clear a provider's cooldown (PLAN §40 — settings action). */
export async function clearCooldown(providerId: string): Promise<void> {
  const all = await readAll();
  delete all[providerId];
  await writeAll(all);
}
