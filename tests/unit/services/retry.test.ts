import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../../../src/services/retry.js';

describe('retryWithBackoff', () => {
  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      initialDelay: 10,
      maxDelay: 100,
      factor: 2,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(retryWithBackoff(fn, {
      maxAttempts: 2,
      initialDelay: 10,
      maxDelay: 100,
      factor: 2,
    })).rejects.toThrow('Max retry attempts');
  });
});
