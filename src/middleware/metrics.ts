/**
 * Prometheus metrics middleware for tracking request metrics.
 */

import client from 'prom-client';
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

// Create a Registry to register metrics
const register = new client.Registry();

// Default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// HTTP request metrics
const httpRequestDuration = new client.Histogram({
  name: 'llm_gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'llm_gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// LLM-specific metrics
const providerLatency = new client.Histogram({
  name: 'llm_gateway_provider_latency_seconds',
  help: 'Duration of LLM API requests in seconds',
  labelNames: ['provider', 'model', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

const tokensUsed = new client.Counter({
  name: 'llm_gateway_tokens_total',
  help: 'Total tokens used in LLM requests',
  labelNames: ['provider', 'model', 'type'],
  registers: [register],
});

const cacheHits = new client.Counter({
  name: 'llm_gateway_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['type'],
  registers: [register],
});

const cacheMisses = new client.Counter({
  name: 'llm_gateway_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['type'],
  registers: [register],
});

const circuitBreakerState = new client.Gauge({
  name: 'llm_gateway_circuit_breaker_state',
  help: 'Current state of circuit breaker (0=closed, 1=open, 2=half-open)',
  labelNames: ['provider'],
  registers: [register],
});

const rateLimitExceeded = new client.Counter({
  name: 'llm_gateway_rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded events',
  labelNames: ['key'],
  registers: [register],
});

/**
 * Metrics middleware for Fastify.
 */
export function metricsMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const startTime = Date.now();

  reply.raw.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = request.routeOptions?.url || request.url;

    httpRequestDuration.observe(
      {
        method: request.method,
        route,
        status_code: reply.statusCode.toString(),
      },
      duration
    );

    httpRequestTotal.inc({
      method: request.method,
      route,
      status_code: reply.statusCode.toString(),
    });
  });

  done();
}

/**
 * Track LLM request latency.
 */
export function trackLLMRequest(
  provider: string,
  model: string,
  status: string,
  durationSeconds: number
): void {
  providerLatency.observe({ provider, model, status }, durationSeconds);
}

/**
 * Track token usage.
 */
export function trackTokens(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): void {
  tokensUsed.inc({ provider, model, type: 'prompt' }, promptTokens);
  tokensUsed.inc({ provider, model, type: 'completion' }, completionTokens);
}

/**
 * Track cache hit.
 */
export function trackCacheHit(type: string = 'idempotency'): void {
  cacheHits.inc({ type });
}

/**
 * Track cache miss.
 */
export function trackCacheMiss(type: string = 'idempotency'): void {
  cacheMisses.inc({ type });
}

/**
 * Update circuit breaker state gauge.
 */
export function updateCircuitBreakerState(
  provider: string,
  state: 'closed' | 'open' | 'half-open'
): void {
  const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
  circuitBreakerState.set({ provider }, stateValue);
}

/**
 * Track rate limit exceeded.
 */
export function trackRateLimitExceeded(key: string): void {
  rateLimitExceeded.inc({ key });
}

/**
 * Get metrics in Prometheus format.
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics content type.
 */
export function getContentType(): string {
  return register.contentType;
}

export { register };
