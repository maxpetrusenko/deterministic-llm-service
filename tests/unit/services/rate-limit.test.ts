import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../../src/middleware/rate-limit.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under limit', () => {
    const limiter = new RateLimiter(5, 60000);
    const result = limiter.check('ip-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests over limit', () => {
    const limiter = new RateLimiter(2, 60000);

    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
  });

  it('tracks different keys separately', () => {
    const limiter = new RateLimiter(1, 60000);

    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
    expect(limiter.check('ip-2').allowed).toBe(true);
  });
});
