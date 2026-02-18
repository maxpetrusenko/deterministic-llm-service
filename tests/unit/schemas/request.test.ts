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
