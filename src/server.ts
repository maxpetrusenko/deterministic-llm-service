import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
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
    logger: false,
    disableRequestLogging: true,
  });

  await server.register(cors);

  server.addHook('onRequest', requestIdMiddleware);

  const rateLimiter = new RateLimiter(
    parseInt(process.env.RATE_LIMIT_MAX ?? '100'),
    parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000')
  );
  server.addHook('onRequest', rateLimitMiddleware(rateLimiter));

  await server.register(healthRoutes);

  const providers = [
    new OpenAIProvider(),
    new AnthropicProvider(),
  ];

  const llmService = new LLMService(
    providers,
    process.env.DEFAULT_PROVIDER ?? 'openai'
  );

  const idempotencyCache = new IdempotencyCache(
    parseInt(process.env.IDEMPOTENCY_TTL_MS ?? '3600000')
  );

  await server.register((instance) => chatRoutes(instance, llmService, idempotencyCache));

  server.setErrorHandler((error, _request, reply) => {
    const err = error as Error;
    logger.error({
      requestId: _request.id,
      error: err.message,
      stack: err.stack,
    }, 'Request error');

    if (error instanceof ZodError) {
      reply.code(400).send({
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }

    reply.code(500).send({
      error: 'Internal server error',
      requestId: _request.id,
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
