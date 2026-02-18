import { logger } from '../middleware/logger.js';

interface CacheEntry {
  response: unknown;
  timestamp: number;
}

export class IdempotencyCache {
  private cache: Map<string, CacheEntry>;
  private ttl: number;

  constructor(ttlMs: number = 3600000) {
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    logger.debug({ key }, 'Idempotency cache hit');
    return entry.response;
  }

  set(key: string, response: unknown): void {
    this.cache.set(key, { response, timestamp: Date.now() });
    logger.debug({ key }, 'Idempotency cache set');
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }
}
