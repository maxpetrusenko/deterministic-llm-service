import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from './logger.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private requests: Map<string, RateLimitEntry>;
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.requests = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      const newEntry = { count: 1, resetTime: now + this.windowMs };
      this.requests.set(key, newEntry);
      return { allowed: true, remaining: this.maxRequests - 1, resetTime: newEntry.resetTime };
    }

    if (entry.count >= this.maxRequests) {
      logger.warn({ key }, 'Rate limit exceeded');
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    return { allowed: true, remaining: this.maxRequests - entry.count, resetTime: entry.resetTime };
  }

  getMaxRequests(): number {
    return this.maxRequests;
  }
}

export function rateLimitMiddleware(limiter: RateLimiter) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = request.ip;
    const result = limiter.check(key);

    reply.header('X-RateLimit-Limit', limiter.getMaxRequests());
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      reply.code(429).send({
        error: 'Too many requests',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      });
      return;
    }
  };
}
