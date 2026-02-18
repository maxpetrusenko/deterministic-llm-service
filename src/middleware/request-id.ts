import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

export async function requestIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const id = request.headers['x-request-id'] as string ?? randomUUID();
  request.id = id;
  reply.header('x-request-id', id);
}
