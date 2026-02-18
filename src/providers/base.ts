export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  finishReason: 'stop' | 'length' | 'content_filter';
  usage: Usage;
}

export type ProviderResult =
  | { success: true; data: ChatResponse }
  | { success: false; error: Error; retryable: boolean };

export interface LLMProvider {
  name: string;
  chat(request: ChatRequest): Promise<ProviderResult>;
}
