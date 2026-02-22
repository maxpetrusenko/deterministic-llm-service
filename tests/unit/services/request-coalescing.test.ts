/**
 * Tests for request coalescing.
 */

import { describe, it, expect, vi } from 'vitest';
import { RequestCoalescer, coalesce } from '../../../src/services/request-coalescing.js';

describe('RequestCoalescer', () => {
  it('should execute function on first call', async () => {
    const coalescer = new RequestCoalescer<string, number>();
    const fn = vi.fn().mockResolvedValue(42);

    const result = await coalescer.execute('key1', fn);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should coalesce concurrent identical requests', async () => {
    const coalescer = new RequestCoalescer<string, number>();
    let callCount = 0;

    const fn = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return callCount;
    });

    // Fire 5 identical requests concurrently
    const results = await Promise.all([
      coalescer.execute('key1', fn),
      coalescer.execute('key1', fn),
      coalescer.execute('key1', fn),
      coalescer.execute('key1', fn),
      coalescer.execute('key1', fn),
    ]);

    // All should return the same result
    expect(results.every((r) => r === results[0])).toBe(true);
    // Only one actual call should have been made
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not coalesce different keys', async () => {
    const coalescer = new RequestCoalescer<string, number>();
    const fn = vi.fn().mockResolvedValue(1);

    await Promise.all([
      coalescer.execute('key1', fn),
      coalescer.execute('key2', fn),
      coalescer.execute('key3', fn),
    ]);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should allow new requests after window expires', async () => {
    const coalescer = new RequestCoalescer<string, number>(10);
    const fn = vi.fn().mockResolvedValue(1);

    await coalescer.execute('key1', fn);
    await new Promise((r) => setTimeout(r, 20));
    await coalescer.execute('key1', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should track pending count', async () => {
    const coalescer = new RequestCoalescer<string, number>();

    const fn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 1;
    });

    const promise = coalescer.execute('key1', fn);
    expect(coalescer.pendingCount).toBe(1);

    await promise;
    expect(coalescer.pendingCount).toBe(0);
  });

  it('should clear all pending requests', async () => {
    const coalescer = new RequestCoalescer<string, number>();
    coalescer.clear();
    expect(coalescer.pendingCount).toBe(0);
  });

  it('should serialize object keys', async () => {
    const coalescer = new RequestCoalescer<{ id: string }, number>();
    const fn = vi.fn().mockResolvedValue(1);

    const key1 = { id: 'a' };
    const key2 = { id: 'a' };

    await Promise.all([
      coalescer.execute(key1, fn),
      coalescer.execute(key2, fn),
    ]);

    // Same object structure should be coalesced
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('coalesce helper', () => {
  it('should create a coalesced function', async () => {
    let count = 0;
    const fn = async (key: string) => {
      count++;
      return key.toUpperCase();
    };

    const coalescedFn = coalesce(fn, 100);

    const results = await Promise.all([
      coalescedFn('test'),
      coalescedFn('test'),
      coalescedFn('test'),
    ]);

    expect(results).toEqual(['TEST', 'TEST', 'TEST']);
    expect(count).toBe(1);
  });
});
