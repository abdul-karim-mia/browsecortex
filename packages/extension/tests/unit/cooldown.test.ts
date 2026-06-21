import { describe, it, expect } from 'vitest';
import { nextCooldown, type Cooldown } from '@/providers/cooldown';

const NOW = 1_000_000;

describe('nextCooldown', () => {
  it('starts at the first backoff step (5s) with no prior cooldown', () => {
    const cd = nextCooldown('p', null, null, NOW);
    expect(cd.until - NOW).toBe(5_000);
    expect(cd.level).toBe(0);
    expect(cd.state).toBe('cooling_down');
  });

  it('respects a Retry-After header when present', () => {
    const cd = nextCooldown('p', null, 42, NOW);
    expect(cd.until - NOW).toBe(42_000);
  });

  it('advances backoff steps after an expired cooldown', () => {
    const expired: Cooldown = { providerId: 'p', until: NOW - 1, level: 0, state: 'cooling_down' };
    const cd = nextCooldown('p', expired, null, NOW);
    expect(cd.until - NOW).toBe(15_000); // step 1
    expect(cd.level).toBe(1);
  });

  it('doubles remaining time and degrades on a 429 while still cooling', () => {
    const active: Cooldown = {
      providerId: 'p',
      until: NOW + 10_000,
      level: 1,
      state: 'cooling_down',
    };
    const cd = nextCooldown('p', active, null, NOW);
    expect(cd.until - NOW).toBe(20_000); // remaining (10s) doubled
    expect(cd.state).toBe('degraded');
  });

  it('caps backoff at the longest step (5min)', () => {
    let cd: Cooldown = { providerId: 'p', until: NOW - 1, level: 3, state: 'cooling_down' };
    cd = nextCooldown('p', cd, null, NOW);
    expect(cd.until - NOW).toBe(300_000);
    expect(cd.level).toBe(3);
  });
});
