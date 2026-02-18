# Deterministic LLM Service Implementation Plan

## Overview

Production-grade TypeScript/Node.js HTTP gateway for LLM providers (OpenAI, Anthropic) with strong reliability controls: retries, timeouts, circuit breakers, rate limiting, idempotency keys, structured logging, and schema enforcement.

**Goal**: Signal maturity - show you can productionize AI behind strong interfaces and reliability controls.

## Current State Analysis

Greenfield project. Empty workspace at `/Users/maxpetrusenko/Desktop/Projects/deterministic-llm-service`.

**Key Requirements (from user spec)**:
- TypeScript / Node.js
- Fastify (preferred over Express - reads more serious)
- zod for request/response validation
- pino structured logging
- openai/anthropic SDKs behind an interface
- rate limiting
- idempotency keys
- retries with exponential backoff
- timeouts (configurable per request)
- circuit breakers (fail fast when provider is down)
- structured JSON schema enforcement
- failure detection
- tool calling support

## Desired End State

A clean, single-purpose infrastructure repo demonstrating:

1. **Reliability**: Requests succeed reliably despite transient failures
2. **Observability**: Every request logged with trace ID, timing, outcome
3. **Safety**: Schema validation prevents invalid data from reaching providers
4. **Efficiency**: Circuit breakers prevent cascading failures
5. **Correctness**: Idempotency keys prevent duplicate processing

### Verification:
```bash
# Health check returns 200 with provider status
curl http://localhost:3000/health

# Completes successfully with retries
npm test

# All logs are structured JSON
tail -f logs/app.log | jq

# Schema validation rejects bad requests
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"invalid": "schema"}' \
  # Returns 400 with detailed zod error
```

## What We're NOT Doing

- Web UI or dashboard
- Database persistence (idempotency via in-memory cache)
- Streaming responses (initially)
- Multi-tenancy/organizations
- Authentication/authorization
- Multiple models per request (router patterns)
- Cost tracking/budgets
- Prompt templates

## Implementation Approach

**Layered architecture**:
1. **HTTP Layer** (Fastify) - request/response, validation via zod
2. **Service Layer** - business logic, idempotency, orchestration
3. **Provider Layer** - abstract interface over OpenAI/Anthropic SDKs
4. **Reliability Layer** - retries, circuit breaker, timeouts
5. **Logging Layer** - pino with request context

**Key patterns**:
- **Dependency injection**: All services injected, testable
- **Middleware**: Rate limiting, request ID, logging at Fastify level
- **Result types**: discriminated unions for error handling
- **Circuit breaker**: Opossum (battle-tested)

## Phase 1: Foundation (HTTP + Validation + Logging)

### Overview
Bootstrap Fastify server with zod validation schemas and pino structured logging.

### Changes Required:

#### 1. Project Structure
```
deterministic-llm-service/
├── src/
│   ├── server.ts           # Fastify app entry
│   ├── routes/
│   │   ├── health.ts       # Health check endpoint
│   │   └── chat.ts         # Chat completions endpoint
│   ├── schemas/
│   │   └── request.ts      # zod validation schemas
│   ├── providers/
│   │   ├── base.ts         # Provider interface
│   │   ├── openai.ts       # OpenAI implementation
│   │   └── anthropic.ts    # Anthropic implementation
│   ├── middleware/
│   │   ├── request-id.ts   # Request ID generation
│   │   └── logger.ts       # Pino setup
│   ├── services/
│   │   └── llm-service.ts  # Business logic
│   └── types/
│       └── index.ts        # Shared types
├── logs/
├── package.json
├── tsconfig.json
└── README.md
```

#### 2. package.json
```json
{
  "name": "deterministic-llm-service",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node --loader tsx src/server.ts",
    "test": "vitest",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@opossumjs/opossum": "^8.0.0",
    "fastify": "^5.2.0",
    "pino": "^9.0.0",
    "zod": "^3.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

#### 3. src/middleware/logger.ts
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
```

#### 4. src/middleware/request-id.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const id = request.headers['x-request-id'] as string ?? randomUUID();
  request.id = id;
  reply.header('x-request-id', id);
}
```

#### 5. src/schemas/request.ts
```typescript
import { z } from 'zod';

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  provider: z.enum(['openai', 'anthropic']).optional(),
  timeout: z.number().positive().optional().default(30000),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;

export const ChatCompletionResponseSchema = z.object({
  id: z.string(),
  content: z.string(),
  model: z.string(),
  finishReason: z.enum(['stop', 'length', 'content_filter']),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>;
```

#### 6. src/providers/base.ts
```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  finishReason: 'stop' | 'length' | 'content_filter';
  usage: Usage;
}

export type ProviderResult =
  | { success: true; data: ChatResponse }
  | { success: false; error: Error; retryable: boolean };

export interface LLMProvider {
  name: string;
  chat(request: ChatRequest): Promise<ProviderResult>;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Server starts: `npm run dev`
- [ ] Health endpoint returns 200: `curl http://localhost:3000/health`
- [ ] Invalid schema returns 400 with zod error details

#### Manual Verification:
- [ ] Structured logs output JSON with `level`, `time`, `msg`, `reqId`
- [ ] Request ID header is echoed in response
- [ ] Zod errors are human-readable

---

## Phase 2: Provider Implementations

### Overview
Implement OpenAI and Anthropic SDK adapters behind the LLMProvider interface.

### Changes Required:

#### 1. src/providers/openai.ts
```typescript
import OpenAI from 'openai';
import type { LLMProvider, ChatRequest, ChatResponse, ProviderResult } from './base.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ProviderResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      });

      return {
        success: true,
        data: {
          id: response.id,
          content: response.choices[0]?.message?.content ?? '',
          model: response.model,
          finishReason: response.choices[0]?.finish_reason === 'length' ? 'length' : 'stop',
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
        },
      };
    } catch (error) {
      const isRetryable = this.isRetryable(error);
      return { success: false, error: error as Error, retryable: isRetryable };
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      return error.status ? error.status >= 500 || error.status === 429 : true;
    }
    return true;
  }
}
```

#### 2. src/providers/anthropic.ts
```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatRequest, ChatResponse, ProviderResult } from './base.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ProviderResult> {
    try {
      const systemMsg = request.messages.find(m => m.role === 'system');
      const messages = request.messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        model: request.model,
        system: systemMsg?.content,
        messages: messages as Anthropic.MessageParam[],
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
      });

      return {
        success: true,
        data: {
          id: response.id,
          content: response.content[0]?.type === 'text' ? response.content[0].text : '',
          model: response.model,
          finishReason: response.stop_reason === 'max_tokens' ? 'length' : 'stop',
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        },
      };
    } catch (error) {
      const isRetryable = this.isRetryable(error);
      return { success: false, error: error as Error, retryable: isRetryable };
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Anthropic.APIError) {
      return error.status ? error.status >= 500 || error.status === 429 : true;
    }
    return true;
  }
}
```

#### 3. src/providers/index.ts
```typescript
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';

export { OpenAIProvider, AnthropicProvider };
export type { LLMProvider, ChatRequest, ChatResponse, ProviderResult } from './base.js';
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Provider instantiation works with env vars
- [ ] Mock tests pass: `npm test`

#### Manual Verification:
- [ ] Can make real OpenAI request with valid API key
- [ ] Can make real Anthropic request with valid API key
- [ ] Errors are properly typed as ProviderResult

---

## Phase 3: Reliability Layer (Retries + Circuit Breaker)

### Overview
Add exponential backoff retry logic and circuit breaker using Opossum.

### Changes Required:

#### 1. src/services/retry.ts
```typescript
export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { maxAttempts: 3, initialDelay: 100, maxDelay: 5000, factor: 2 }
): Promise<T> {
  let delay = options.initialDelay;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === options.maxAttempts) {
        throw new Error(
          `Max retry attempts (${options.maxAttempts}) reached. Last error: ${lastError.message}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * options.factor, options.maxDelay);
    }
  }

  throw lastError;
}
```

#### 2. src/services/circuit-breaker.ts
```typescript
import CircuitBreaker from 'opossum';
import type { ProviderResult, ChatResponse } from '../providers/base.js';

export interface CircuitBreakerOptions {
  timeout: number;
  errorThresholdPercentage: number;
  resetTimeout: number;
}

export function createCircuitBreaker(
  fn: () => Promise<ProviderResult>,
  options: CircuitBreakerOptions
): CircuitBreaker {
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
```

#### 3. src/services/llm-service.ts
```typescript
import { logger } from '../middleware/logger.js';
import type { LLMProvider, ChatRequest, ChatResponse } from '../providers/base.js';
import { retryWithBackoff, type RetryOptions } from './retry.js';
import { createCircuitBreaker, type CircuitBreakerOptions } from './circuit-breaker.js';

export interface LLMServiceOptions {
  retry?: RetryOptions;
  circuitBreaker?: CircuitBreakerOptions;
}

export class LLMService {
  private providers: Map<string, LLMProvider>;
  private defaultProvider: string;
  private circuitBreakers: Map<string, any>;

  constructor(providers: LLMProvider[], defaultProvider: string, options?: LLMServiceOptions) {
    this.providers = new Map(providers.map(p => [p.name, p]));
    this.defaultProvider = defaultProvider;
    this.circuitBreakers = new Map();

    for (const provider of providers) {
      const breaker = createCircuitBreaker(
        () => provider.chat({} as ChatRequest),
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
      const wrapped = breaker.fire.bind(breaker);
      return wrapped(request);
    });

    if (!result.success) {
      throw result.error;
    }

    return result.data;
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Circuit breaker opens after threshold failures
- [ ] Circuit breaker closes after reset timeout
- [ ] Retry logic respects exponential backoff
- [ ] Tests pass: `npm test`

#### Manual Verification:
- [ ] Logs show circuit breaker state changes
- [ ] Retry attempts are logged
- [ ] Fallback response returned when circuit is open

---

## Phase 4: Idempotency + Rate Limiting

### Overview
Add idempotency key support and rate limiting middleware.

### Changes Required:

#### 1. src/services/idempotency.ts
```typescript
import { logger } from '../middleware/logger.js';

interface CacheEntry {
  response: any;
  timestamp: number;
}

export class IdempotencyCache {
  private cache: Map<string, CacheEntry>;
  private ttl: number;

  constructor(ttlMs: number = 3600000) { // 1 hour default
    this.cache = new Map();
    this.ttl = ttlMs;
  }

  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    logger.debug({ key }, 'Idempotency cache hit');
    return entry.response;
  }

  set(key: string, response: any): void {
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
```

#### 2. src/middleware/rate-limit.ts
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
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
}

export function rateLimitMiddleware(limiter: RateLimiter) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = request.ip;
    const result = limiter.check(key);

    reply.header('X-RateLimit-Limit', limiter['maxRequests']);
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
```

### Success Criteria:

#### Automated Verification:
- [ ] Idempotency key returns cached response
- [ ] Rate limit returns 429 after threshold
- [ ] Rate limit headers are present
- [ ] Tests pass: `npm test`

#### Manual Verification:
- [ ] Same idempotency key returns same response ID
- [ ] Rate limit resets after window expires
- [ ] Multiple IPs tracked separately

---

## Phase 5: Routes + Server Integration

### Overview
Wire everything together into the Fastify server.

### Changes Required:

#### 1. src/routes/health.ts
```typescript
import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requestId: request.id,
    };
  });
}
```

#### 2. src/routes/chat.ts
```typescript
import { FastifyInstance } from 'fastify';
import { ChatCompletionRequestSchema, ChatCompletionResponseSchema } from '../schemas/request.js';
import { LLMService } from '../services/llm-service.js';
import { IdempotencyCache } from '../services/idempotency.js';
import { logger } from '../middleware/logger.js';

export async function chatRoutes(
  fastify: FastifyInstance,
  llmService: LLMService,
  idempotencyCache: IdempotencyCache
) {
  fastify.post('/v1/chat/completions', async (request, reply) => {
    const idempotencyKey = request.headers['x-idempotency-key'] as string;

    if (idempotencyKey) {
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached) {
        logger.info({ idempotencyKey, requestId: request.id }, 'Returning cached response');
        return reply.code(200).header('X-Cached', 'true').send(cached);
      }
    }

    const body = ChatCompletionRequestSchema.parse(request.body);
    const provider = body.provider;

    logger.info({
      requestId: request.id,
      model: body.model,
      provider: provider ?? 'default',
      messageCount: body.messages.length,
    }, 'Chat completion request');

    const response = await llmService.chat({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
    }, provider);

    const validatedResponse = ChatCompletionResponseSchema.parse(response);

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, validatedResponse);
    }

    logger.info({
      requestId: request.id,
      responseId: validatedResponse.id,
      tokens: validatedResponse.usage.totalTokens,
    }, 'Chat completion success');

    return reply.code(200).send(validatedResponse);
  });
}
```

#### 3. src/server.ts
```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from './middleware/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { rateLimitMiddleware, RateLimiter } from './middleware/rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { OpenAIProvider, AnthropicProvider } from './providers/index.js';
import { LLMService } from './services/llm-service.js';
import { IdempotencyCache } from './services/idempotency.js';

async function buildServer() {
  const server = Fastify({
    logger: false, // Using pino directly
    disableRequestLogging: true,
  });

  await server.register(cors);

  server.addHook('onRequest', requestIdMiddleware);

  const rateLimiter = new RateLimiter(
    parseInt(process.env.RATE_LIMIT_MAX ?? '100'),
    parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000')
  );
  server.addHook('onRequest', rateLimitMiddleware(rateLimiter));

  // Register routes
  await server.register(healthRoutes);

  const providers = [
    new OpenAIProvider(),
    new AnthropicProvider(),
  ];

  const llmService = new LLMService(
    providers,
    process.env.DEFAULT_PROVIDER ?? 'openai',
    {
      retry: {
        maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS ?? '3'),
        initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY_MS ?? '100'),
        maxDelay: parseInt(process.env.RETRY_MAX_DELAY_MS ?? '5000'),
        factor: 2,
      },
      circuitBreaker: {
        timeout: parseInt(process.env.CIRCUIT_TIMEOUT_MS ?? '30000'),
        errorThresholdPercentage: parseInt(process.env.CIRCUIT_ERROR_THRESHOLD ?? '50'),
        resetTimeout: parseInt(process.env.CIRCUIT_RESET_TIMEOUT_MS ?? '60000'),
      },
    }
  );

  const idempotencyCache = new IdempotencyCache(
    parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '3600000')
  );

  await server.register((instance) => chatRoutes(instance, llmService, idempotencyCache));

  // Error handler
  server.setErrorHandler((error, request, reply) => {
    logger.error({
      requestId: request.id,
      error: error.message,
      stack: error.stack,
    }, 'Request error');

    if (error.name === 'ZodError') {
      reply.code(400).send({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    reply.code(500).send({
      error: 'Internal server error',
      requestId: request.id,
    });
  });

  return server;
}

async function main() {
  const server = await buildServer();
  const port = parseInt(process.env.PORT ?? '3000');

  logger.info({ port }, 'Starting server');

  try {
    await server.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    logger.error({ error: err }, 'Server failed to start');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { buildServer };
```

### Success Criteria:

#### Automated Verification:
- [ ] Server starts without errors: `npm run dev`
- [ ] Health check works: `curl http://localhost:3000/health`
- [ ] Chat completions endpoint accepts valid requests
- [ ] All tests pass: `npm test`
- [ ] TypeScript compiles: `npm run typecheck`

#### Manual Verification:
- [ ] Full request flow works end-to-end
- [ ] Structured logs show complete request lifecycle
- [ ] Circuit breaker triggers and recovers
- [ ] Idempotency key prevents duplicate processing
- [ ] Rate limiting works and resets

---

## Phase 6: Tests + GitHub Publish

### Overview
Comprehensive test suite and publish as public GitHub repo.

### Changes Required:

#### 1. Test Directory Structure
```
tests/
├── unit/
│   ├── providers/
│   │   ├── openai.test.ts
│   │   └── anthropic.test.ts
│   ├── services/
│   │   ├── retry.test.ts
│   │   ├── circuit-breaker.test.ts
│   │   ├── idempotency.test.ts
│   │   └── rate-limit.test.ts
│   └── schemas/
│       └── request.test.ts
├── integration/
│   └── chat-api.test.ts
└── setup.ts
```

#### 2. tests/setup.ts
```typescript
import { beforeEach } from 'vitest';
import { vi } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
});
```

#### 3. tests/unit/services/retry.test.ts
```typescript
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
```

#### 4. tests/unit/services/circuit-breaker.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createCircuitBreaker } from '../../../src/services/circuit-breaker.js';

describe('CircuitBreaker', () => {
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

    // Trigger failures
    for (let i = 0; i < 3; i++) {
      try { await breaker.fire(); } catch {}
    }

    // Circuit should be open
    const fallback = await breaker.fire();
    expect(fallback.success).toBe(false);
    expect(fallback.error?.message).toContain('Circuit breaker is OPEN');
  });
});
```

#### 5. tests/unit/services/idempotency.test.ts
```typescript
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
```

#### 6. tests/unit/services/rate-limit.test.ts
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../../src/middleware/rate-limit.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows requests under limit', () => {
    const limiter = new RateLimiter(5, 60000);
    const result = limiter.check('ip-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests over limit', () => {
    const limiter = new RateLimiter(2, 60000);

    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
  });

  it('tracks different keys separately', () => {
    const limiter = new RateLimiter(1, 60000);

    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
    expect(limiter.check('ip-2').allowed).toBe(true);
  });
});
```

#### 7. tests/unit/schemas/request.test.ts
```typescript
import { describe, it, expect } from 'vitest';
import {
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  MessageSchema,
} from '../../../src/schemas/request.js';

describe('Request Schemas', () => {
  describe('MessageSchema', () => {
    it('validates valid messages', () => {
      const result = MessageSchema.safeParse({
        role: 'user',
        content: 'hello',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid roles', () => {
      const result = MessageSchema.safeParse({
        role: 'invalid',
        content: 'hello',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ChatCompletionRequestSchema', () => {
    it('validates valid requests', () => {
      const result = ChatCompletionRequestSchema.safeParse({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
      });
      expect(result.success).toBe(true);
    });

    it('requires model and messages', () => {
      const result = ChatCompletionRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts optional provider', () => {
      const result = ChatCompletionRequestSchema.safeParse({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
        provider: 'openai',
      });
      expect(result.success).toBe(true);
    });
  });
});
```

#### 8. tests/integration/chat-api.test.ts
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';

describe('Chat API Integration', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildServer();
    await server.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns health check', async () => {
    const response = await fetch(`http://127.0.0.1:${server.server.address().port}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
  });

  it('rejects invalid schema with 400', async () => {
    const response = await fetch(
      `http://127.0.0.1:${server.server.address().port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation error');
  });
});
```

#### 9. vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/tests/**'],
    },
  },
});
```

#### 10. README.md (for GitHub)
````markdown
# deterministic-llm-service

> Production-grade HTTP gateway for LLM providers with reliability controls

Fastify-based TypeScript service providing a unified interface for OpenAI and Anthropic with:
- ⚡ Exponential backoff retries
- 🔌 Circuit breakers (Opossum)
- 🚦 Rate limiting per IP
- 🔑 Idempotency key support
- 📊 Pino structured logging
- ✅ Zod schema validation
- 🛡️ Configurable timeouts

## Quick Start

```bash
# Install
npm install

# Configure
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Run
npm run dev

# Test
npm test
```

## Usage

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: my-request-123" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | 3000 | Server port |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `DEFAULT_PROVIDER` | openai | Default LLM provider |
| `RATE_LIMIT_MAX` | 100 | Requests per window |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Window duration |
| `RETRY_MAX_ATTEMPTS` | 3 | Max retry attempts |
| `IDEMPOTENCY_TTL_MS` | 3600000 | Cache TTL (1hr) |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   HTTP      │────▶│   Service    │────▶│  Provider   │
│  (Fastify)  │     │   Layer      │     │   Layer     │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                     │
       ▼                   ▼                     ▼
   Zod Validation    Idempotency         OpenAI/Anthropic
   Request ID        Rate Limit           SDK Interface
   Logging           Circuit Breaker
                     Retries
```

## License

MIT
````

#### 11. .gitignore
```
node_modules/
logs/
*.log
.DS_Store
.env
.env.local
coverage/
dist/
```

#### 12. tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "tests"]
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All unit tests pass: `npm test`
- [ ] Coverage > 80%: `npm run test:coverage`
- [ ] Integration tests pass
- [ ] TypeScript compiles: `npm run typecheck`

#### Manual Verification:
- [ ] `gh repo create` succeeds with public visibility
- [ ] Repo is accessible at `https://github.com/maxpetrusenko/deterministic-llm-service`
- [ ] README renders correctly on GitHub
- [ ] All test badges show passing

---

## Testing Strategy

### Unit Tests:
- Provider implementations with mocked SDKs
- Retry logic with simulated failures
- Circuit breaker state transitions
- Rate limiter window resets
- Idempotency cache TTL expiration
- Schema validation edge cases

### Integration Tests:
- End-to-end chat completions with real provider mocks
- Schema validation rejection of malformed requests
- Concurrent requests with idempotency keys
- Health endpoint responsiveness

### Manual Testing Steps:
1. Start server: `npm run dev`
2. Health check: `curl http://localhost:3000/health`
3. Valid request: `curl -X POST http://localhost:3000/v1/chat/completions -H "Content-Type: application/json" -H "X-Idempotency-Key: test-123" -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'`
4. Retry same idempotency key - should get cached response
5. Send 100+ requests to trigger rate limit
6. Check logs: `tail -f logs/app.log | jq`
7. Verify GitHub repo is public and accessible

## Performance Considerations

- Circuit breaker prevents cascading failures
- Idempotency cache in-memory (consider Redis for distributed)
- Rate limiting per-IP (consider per-API-key for prod)
- Timeouts prevent hanging requests
- Retry with exponential backoff reduces thundering herd

## Migration Notes

Greenfield - no migration needed.

## References

- Fastify docs: https://fastify.dev/
- Zod validation: https://zod.dev/
- Opossum circuit breaker: https://github.com/nodeshift/opossum
- OpenAI SDK: https://github.com/openai/openai-node
- Anthropic SDK: https://github.com/anthropics/anthropic-sdk-typescript
