// @ts-ignore - opossum doesn't have types
import CircuitBreaker from 'opossum';
import type { ProviderResult } from '../providers/base.js';

export interface CircuitBreakerOptions {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
}

export type { CircuitBreaker };

export function createCircuitBreaker(
  // @ts-ignore
  fn: (...args: unknown[]) => Promise<ProviderResult>,
  options: CircuitBreakerOptions
): CircuitBreaker {
  // @ts-ignore
  return new CircuitBreaker(fn, {
    timeout: options.timeout,
    errorThresholdPercentage: options.errorThresholdPercentage,
    resetTimeout: options.resetTimeout,
    fallback: () => ({
      success: false,
      error: new Error('Circuit breaker is OPEN'),
      retryable: false,
    }),
  });
}
