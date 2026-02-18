import OpenAI from 'openai';
import type { LLMProvider, ChatRequest, ChatResponse, ProviderResult } from './base.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ProviderResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      });

      return {
        success: true,
        data: {
          id: response.id,
          content: response.choices[0]?.message?.content ?? '',
          model: response.model,
          finishReason: response.choices[0]?.finish_reason === 'length' ? 'length' : 'stop',
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
        },
      };
    } catch (error) {
      const isRetryable = this.isRetryable(error);
      return { success: false, error: error as Error, retryable: isRetryable };
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof OpenAI.APIError) {
      return error.status ? error.status >= 500 || error.status === 429 : true;
    }
    return true;
  }
}
