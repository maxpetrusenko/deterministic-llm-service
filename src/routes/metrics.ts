/**
 * Prometheus metrics endpoint.
 */

import type { FastifyInstance } from 'fastify';
import { getMetrics, getMetricsContentType } from '../middleware/metrics.js';

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/metrics', async (request, reply) => {
    const metrics = await getMetrics();
    return reply
      .type(getMetricsContentType())
      .send(metrics);
  });
}
