import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';

interface BenchmarkResult {
  name: string;
  samples: number[];
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

function percentiles(arr: number[]): { p50: number; p95: number; p99: number; avg: number } {
  const sorted = [...arr].sort((a, b) => a - b);
  const len = sorted.length;
  return {
    p50: sorted[Math.floor(len * 0.5)],
    p95: sorted[Math.floor(len * 0.95)],
    p99: sorted[Math.floor(len * 0.99)],
    avg: arr.reduce((a, b) => a + b, 0) / arr.length,
  };
}

describe('Benchmarks', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let port: number;

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'sk-test-dummy-key';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-dummy-key';
    server = await buildServer();
    await server.listen({ port: 0, host: '127.0.0.1' });
    port = (server.server.address() as { port: number }).port;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('benchmarks health endpoint latency', async () => {
    const samples: number[] = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fetch(`http://127.0.0.1:${port}/health`);
      samples.push(performance.now() - start);
    }

    const stats = percentiles(samples);

    console.log(`\nHealth Endpoint (${iterations} requests):`);
    console.log(`  p50: ${stats.p50.toFixed(2)}ms`);
    console.log(`  p95: ${stats.p95.toFixed(2)}ms`);
    console.log(`  p99: ${stats.p99.toFixed(2)}ms`);
    console.log(`  avg: ${stats.avg.toFixed(2)}ms`);

    // Health endpoint should be fast
    expect(stats.p95).toBeLessThan(50);
  });

  it('benchmarks validation latency (no provider call)', async () => {
    const samples: number[] = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fetch(
        `http://127.0.0.1:${port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'test'.repeat(100) }],
          }),
        }
      );
      samples.push(performance.now() - start);
    }

    const stats = percentiles(samples);

    console.log(`\nValidation Only (${iterations} requests, fail on provider):`);
    console.log(`  p50: ${stats.p50.toFixed(2)}ms`);
    console.log(`  p95: ${stats.p95.toFixed(2)}ms`);
    console.log(`  p99: ${stats.p99.toFixed(2)}ms`);
    console.log(`  avg: ${stats.avg.toFixed(2)}ms`);
  });

  it('benchmarks concurrent load handling', async () => {
    const iterations = 50;
    const concurrency = 10;

    const start = performance.now();

    const promises = Array.from({ length: iterations }, (_, i) =>
      fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(5000),
      })
    );

    await Promise.all(promises);

    const totalTime = performance.now() - start;
    const reqPerSec = (iterations / totalTime) * 1000;

    console.log(`\nConcurrent Load (${iterations} requests, ${concurrency} concurrent):`);
    console.log(`  total time: ${totalTime.toFixed(2)}ms`);
    console.log(`  requests/sec: ${reqPerSec.toFixed(2)}`);

    expect(reqPerSec).toBeGreaterThan(10);
  });
});
