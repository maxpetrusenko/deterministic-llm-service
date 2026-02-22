/**
 * Tests for Prometheus metrics middleware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  metricsMiddleware,
  trackLLMRequest,
  trackTokens,
  trackCacheHit,
  trackCacheMiss,
  updateCircuitBreakerState,
  trackRateLimitExceeded,
  getMetrics,
  register,
} from '../../../src/middleware/metrics.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

describe('Metrics Middleware', () => {
  beforeEach(() => {
    // Reset metrics before each test
    register.resetMetrics();
  });

  afterEach(() => {
    register.resetMetrics();
  });

  describe('getMetrics', () => {
    it('should return Prometheus formatted metrics', async () => {
      const metrics = await getMetrics();

      expect(metrics).toContain('llm_gateway_http_request_duration_seconds');
      expect(metrics).toContain('llm_gateway_http_requests_total');
      expect(metrics).toContain('llm_gateway_provider_latency_seconds');
    });
  });

  describe('trackLLMRequest', () => {
    it('should track LLM request latency', async () => {
      trackLLMRequest('openai', 'gpt-4', 'success', 1.5);

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_gateway_provider_latency_seconds');
      expect(metrics).toContain('openai');
      expect(metrics).toContain('gpt-4');
    });

    it('should track failed requests', async () => {
      trackLLMRequest('anthropic', 'claude-3', 'error', 0.5);

      const metrics = await getMetrics();
      expect(metrics).toContain('error');
    });
  });

  describe('trackTokens', () => {
    it('should track prompt and completion tokens', async () => {
      trackTokens('openai', 'gpt-4', 100, 50);

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_gateway_tokens_total');
      expect(metrics).toContain('prompt');
      expect(metrics).toContain('completion');
    });
  });

  describe('cache tracking', () => {
    it('should track cache hits', async () => {
      trackCacheHit('idempotency');
      trackCacheHit('idempotency');
      trackCacheMiss('idempotency');

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_gateway_cache_hits_total');
      expect(metrics).toContain('llm_gateway_cache_misses_total');
    });
  });

  describe('circuit breaker state', () => {
    it('should track circuit breaker state', async () => {
      updateCircuitBreakerState('openai', 'closed');
      updateCircuitBreakerState('anthropic', 'open');

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_gateway_circuit_breaker_state');
    });
  });

  describe('rate limit tracking', () => {
    it('should track rate limit exceeded', async () => {
      trackRateLimitExceeded('ip-192.168.1.1');
      trackRateLimitExceeded('ip-192.168.1.1');

      const metrics = await getMetrics();
      expect(metrics).toContain('llm_gateway_rate_limit_exceeded_total');
    });
  });

  describe('metricsMiddleware', () => {
    it('should be a function', () => {
      expect(typeof metricsMiddleware).toBe('function');
    });

    it('should call done callback', () => {
      const mockRequest = {} as FastifyRequest;
      const mockReply = {
        raw: {
          on: vi.fn(),
        },
        statusCode: 200,
      } as unknown as FastifyReply;
      const done = vi.fn();

      metricsMiddleware(mockRequest, mockReply, done);
      expect(done).toHaveBeenCalled();
    });
  });
});
