import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';

describe('Chat API Integration', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    // Set dummy API keys for integration tests
    process.env.OPENAI_API_KEY = 'sk-test-dummy-key';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy-key';

    server = await buildServer();
    await server.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('returns health check', async () => {
    const port = (server.server.address() as { port: number }).port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const data = await response.json() as { status: string };

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
  });

  it('rejects invalid schema with 400', async () => {
    const port = (server.server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'schema' }),
      }
    );

    const data = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation error');
  });
});
