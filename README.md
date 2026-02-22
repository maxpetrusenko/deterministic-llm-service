# deterministic-llm-service

[![CI](https://github.com/maxpetrusenko/deterministic-llm-service/workflows/CI/badge.svg)](https://github.com/maxpetrusenko/deterministic-llm-service/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)

> Production-grade HTTP gateway for LLM providers with reliability controls

Fastify-based TypeScript service providing a unified interface for OpenAI and Anthropic with:

- ⚡ Exponential backoff retries
- 🔌 Circuit breakers (Opossum)
- 🚦 Rate limiting per IP
- 🔑 Idempotency key support
- 📊 Pino structured logging
- ✅ Zod schema validation
- 🛡️ Configurable timeouts
- 📖 OpenAPI 3.0 spec
- 📈 **Prometheus metrics** - request latency, error rates, cache hit ratio
- 🔄 **Request coalescing** - dedupe concurrent identical requests

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

## Metrics

Access Prometheus metrics at `/metrics`:

```
curl http://localhost:3000/metrics
```

Available metrics:
- `llm_gateway_http_request_duration_seconds` - HTTP request latency histogram
- `llm_gateway_http_requests_total` - Total HTTP requests counter
- `llm_gateway_provider_latency_seconds` - LLM provider latency
- `llm_gateway_tokens_total` - Token usage by provider/model
- `llm_gateway_cache_hits_total` / `cache_misses_total` - Cache hit ratio
- `llm_gateway_circuit_breaker_state` - Circuit breaker state gauge
- `llm_gateway_rate_limit_exceeded_total` - Rate limit events

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

## API Documentation

See [openapi.yaml](./openapi.yaml) for the full OpenAPI 3.0 specification.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/chat/completions` | Create chat completion |

### Response Headers

All responses include:
- `X-Request-Id`: Unique request identifier for tracing
- `X-RateLimit-Limit`: Requests per rate limit window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: ISO timestamp when rate limit resets
- `X-Cached`: `true` if response was served from idempotency cache

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Type check
npm run typecheck

# Run specific test suites
npm test -- chaos
npm test -- benchmark
```

### Test Suites

- **Unit tests**: Provider mocks, retry logic, circuit breaker, rate limiter, idempotency cache, schema validation
- **Integration tests**: End-to-end API tests
- **Chaos tests**: Malformed input, rate limiting, idempotency behavior
- **Benchmarks**: Latency percentiles (p50/p95/p99) under load

## Reliability Features

### Retries
- Exponential backoff with configurable max attempts
- Smart retry detection (429, 5xx errors)
- Configurable initial delay and max delay

### Circuit Breaker
- Automatic circuit opening after error threshold
- Half-open state for recovery testing
- Fallback responses when circuit is open

### Rate Limiting
- Per-IP sliding window rate limiting
- Configurable window size and request limit
- Standard rate limit headers in responses

### Idempotency
- Cache responses by idempotency key
- 1-hour TTL (configurable)
- Prevents duplicate processing

## License

MIT
