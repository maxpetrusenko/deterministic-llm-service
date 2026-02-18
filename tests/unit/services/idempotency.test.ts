import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyCache } from '../../../src/services/idempotency.js';

describe('IdempotencyCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('stores and retrieves values', () => {
    const cache = new IdempotencyCache(1000);
    const response = { id: '123', content: 'test' };

    cache.set('key-1', response);
    const retrieved = cache.get('key-1');

    expect(retrieved).toEqual(response);
  });

  it('returns undefined for missing keys', () => {
    const cache = new IdempotencyCache(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    const cache = new IdempotencyCache(1000);
    cache.set('key-1', { id: '123' });

    vi.advanceTimersByTime(1001);
    expect(cache.get('key-1')).toBeUndefined();
  });

  it('checks key existence', () => {
    const cache = new IdempotencyCache(1000);
    expect(cache.has('key-1')).toBe(false);

    cache.set('key-1', { id: '123' });
    expect(cache.has('key-1')).toBe(true);
  });
});
