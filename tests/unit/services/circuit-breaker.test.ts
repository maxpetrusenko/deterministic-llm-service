import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCircuitBreaker } from '../../../src/services/circuit-breaker.js';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('closes after successful request', async () => {
    const fn = async () => ({ success: true, data: {} });
    const breaker = createCircuitBreaker(fn, {
      timeout: 100,
      errorThresholdPercentage: 50,
      resetTimeout: 1000,
    });

    const result = await breaker.fire();
    expect(result.success).toBe(true);
  });

  it('opens after error threshold', async () => {
    let failCount = 0;
    const fn = async () => {
      failCount++;
      if (failCount < 3) throw new Error('fail');
      return { success: true, data: {} };
    };

    const breaker = createCircuitBreaker(fn, {
      timeout: 100,
      errorThresholdPercentage: 50,
      resetTimeout: 500,
    });

    for (let i = 0; i < 3; i++) {
      try { await breaker.fire(); } catch {}
    }

    // When circuit is open, fire() throws, so we catch and check the error
    try {
      await breaker.fire();
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toContain('Breaker is open');
    }
  });
});
