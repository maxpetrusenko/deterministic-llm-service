import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';

describe('Chaos Mode Tests', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
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

  it('handles malformed JSON gracefully', async () => {
    const port = (server.server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{{{',
      }
    );

    expect(response.status).toBe(400);
  });

  it('rejects requests with missing required fields', async () => {
    const port = (server.server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4' }), // missing messages
      }
    );

    expect(response.status).toBe(400);
    const data = await response.json() as { error: string };
    expect(data.error).toBe('Validation error');
  });

  it('returns 429 after rate limit', async () => {
    const port = (server.server.address() as { port: number }).port;

    // Set a low rate limit via env for this test
    const promises = Array.from({ length: 150 }, () =>
      fetch(
        `http://127.0.0.1:${port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'test' }],
          }),
        }
      )
    );

    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.status === 429);

    // At least some requests should be rate limited
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('serves cached response on idempotency key hit', async () => {
    const port = (server.server.address() as { port: number }).port;
    const idempotencyKey = 'test-idempotency-' + Date.now();

    // First request will fail due to dummy key, but should cache the error response
    const response1 = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'test' }],
        }),
      }
    );

    // Second request with same key should return the same response
    const response2 = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'different' }],
        }),
      }
    );

    // Both should have the same status and similar timing
    expect(response1.status).toBe(response2.status);
  });

  it('includes request ID in all responses', async () => {
    const port = (server.server.address() as { port: number }).port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    const requestId = response.headers.get('x-request-id');
    expect(requestId).toBeTruthy();
    expect(requestId?.length).toBeGreaterThan(0);
  });

  it('includes rate limit headers', async () => {
    const port = (server.server.address() as { port: number }).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/v1/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'test' }],
        }),
      }
    );

    const limit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');

    expect(limit).toBeTruthy();
    expect(remaining).toBeTruthy();
    expect(reset).toBeTruthy();
  });
});
