import type { FastifyInstance } from 'fastify';
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
    try {
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
    } catch (error) {
      // Check if it's a ZodError
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return reply.code(400).send({
          error: 'Validation error',
          details: (error as { errors: unknown[] }).errors,
        });
      }
      throw error; // Re-throw for the global error handler
    }
  });
}
