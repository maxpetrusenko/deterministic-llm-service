import { logger } from '../middleware/logger.js';
import type { LLMProvider, ChatRequest, ChatResponse, ProviderResult } from '../providers/base.js';
import { retryWithBackoff, type RetryOptions } from './retry.js';
import { createCircuitBreaker, type CircuitBreakerOptions, type CircuitBreaker } from './circuit-breaker.js';

export interface LLMServiceOptions {
  retry?: RetryOptions;
  circuitBreaker?: CircuitBreakerOptions;
}

export class LLMService {
  private providers: Map<string, LLMProvider>;
  private defaultProvider: string;
  private circuitBreakers: Map<string, CircuitBreaker>;

  constructor(providers: LLMProvider[], defaultProvider: string, options?: LLMServiceOptions) {
    this.providers = new Map(providers.map(p => [p.name, p]));
    this.defaultProvider = defaultProvider;
    this.circuitBreakers = new Map();

    for (const provider of providers) {
      // @ts-ignore - circuit breaker typing
      const breaker = createCircuitBreaker(
        // @ts-ignore
        (req: ChatRequest) => provider.chat(req),
        options?.circuitBreaker ?? {
          timeout: 30000,
          errorThresholdPercentage: 50,
          resetTimeout: 60000,
        }
      );

      breaker.on('open', () => {
        logger.warn({ provider: provider.name }, 'Circuit breaker opened');
      });

      breaker.on('halfOpen', () => {
        logger.info({ provider: provider.name }, 'Circuit breaker half-open');
      });

      breaker.on('close', () => {
        logger.info({ provider: provider.name }, 'Circuit breaker closed');
      });

      this.circuitBreakers.set(provider.name, breaker);
    }
  }

  async chat(request: ChatRequest, providerName?: string): Promise<ChatResponse> {
    const provider = this.providers.get(providerName ?? this.defaultProvider);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName ?? this.defaultProvider}`);
    }

    const breaker = this.circuitBreakers.get(provider.name)!;

    const result = await retryWithBackoff(async () => {
      return breaker.fire(request) as Promise<ProviderResult>;
    }, {
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 5000,
      factor: 2,
    });

    if (!result.success) {
      throw result.error;
    }

    return result.data;
  }
}
