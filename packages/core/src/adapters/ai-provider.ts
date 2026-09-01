/**
 * AIProvider — the only surface through which Symora talks to a language model.
 *
 * V1 implementation: OpenAI. No provider SDK may be imported outside an
 * implementation of this interface. See .claude/rules/ai-pipeline.md.
 *
 * Type-only stub. Phase 2 provides the implementation.
 */

export type AIModelTier = 'cheap' | 'strong';

export type AIMessageRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

/** A tool the model is allowed to call. Arguments are validated before dispatch. */
export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments, derived from the tool's Zod schema. */
  parameters: Record<string, unknown>;
}

/** A tool call proposed by the model. Arguments are untrusted until validated. */
export interface AIToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
}

export interface AICompletionRequest {
  tier: AIModelTier;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  /** JSON Schema the response must conform to, when a structured output is required. */
  responseSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface AICompletionResult {
  text: string | null;
  toolCalls: AIToolCall[];
  /** Parsed structured output when responseSchema was supplied. Untrusted until validated. */
  structured: unknown;
  usage: AITokenUsage;
  model: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';
}

export interface AIProvider {
  readonly name: string;
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}
