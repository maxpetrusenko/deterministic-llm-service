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
