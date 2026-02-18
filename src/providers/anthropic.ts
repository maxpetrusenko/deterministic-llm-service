import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatRequest, ChatResponse, ProviderResult } from './base.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async chat(request: ChatRequest): Promise<ProviderResult> {
    try {
      const systemMsg = request.messages.find(m => m.role === 'system');
      const messages = request.messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        model: request.model,
        system: systemMsg?.content,
        messages: messages as Anthropic.MessageParam[],
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature,
      });

      return {
        success: true,
        data: {
          id: response.id,
          content: response.content[0]?.type === 'text' ? response.content[0].text : '',
          model: response.model,
          finishReason: response.stop_reason === 'max_tokens' ? 'length' : 'stop',
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        },
      };
    } catch (error) {
      const isRetryable = this.isRetryable(error);
      return { success: false, error: error as Error, retryable: isRetryable };
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Anthropic.APIError) {
      return error.status ? error.status >= 500 || error.status === 429 : true;
    }
    return true;
  }
}
