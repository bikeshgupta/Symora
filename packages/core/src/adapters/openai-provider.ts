/**
 * The only place the `openai` SDK is imported (.claude/rules/ai-pipeline.md § Provider
 * and model use: "No provider SDK is imported anywhere outside its adapter
 * implementation"). Model choice is read from env, not hardcoded — `AI_MODEL_CHEAP` /
 * `AI_MODEL_STRONG` pick the actual model ids, so this file never goes stale as models
 * change.
 */

import OpenAI from 'openai';
import type {
  AICompletionRequest,
  AICompletionResult,
  AIMessage,
  AIProvider,
  AIToolCall,
} from './ai-provider';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY must be set to use the OpenAI provider.');
  client = new OpenAI({ apiKey });
  return client;
}

function modelForTier(tier: AICompletionRequest['tier']): string {
  const envKey = tier === 'cheap' ? 'AI_MODEL_CHEAP' : 'AI_MODEL_STRONG';
  const model = process.env[envKey];
  if (!model) throw new Error(`${envKey} must be set to use the ${tier} model tier.`);
  return model;
}

function toOpenAiMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function safeJsonParse(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapFinishReason(reason: string | null | undefined): AICompletionResult['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
      return 'tool_calls';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'error';
  }
}

export const openAiProvider: AIProvider = {
  name: 'openai',

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const model = modelForTier(request.tier);
    const timeoutMs = request.timeoutMs ?? Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30_000);

    const response = await getClient().chat.completions.create(
      {
        model,
        messages: toOpenAiMessages(request.messages),
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        tools: request.tools?.map((tool) => ({
          type: 'function' as const,
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })),
        response_format: request.responseSchema
          ? { type: 'json_schema', json_schema: { name: 'response', schema: request.responseSchema, strict: false } }
          : undefined,
      },
      { timeout: timeoutMs },
    );

    const choice = response.choices[0];
    const message = choice?.message;

    const toolCalls: AIToolCall[] = (message?.tool_calls ?? [])
      .filter((call) => call.type === 'function')
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeJsonParse(call.function.arguments),
      }));

    const structured = request.responseSchema ? safeJsonParse(message?.content) : null;
    const usage = response.usage;

    return {
      text: message?.content ?? null,
      toolCalls,
      structured,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        // Cost estimation needs a per-model pricing table; left for a later phase
        // rather than hardcoding prices that go stale.
        estimatedCostUsd: undefined,
      },
      model: response.model,
      finishReason: mapFinishReason(choice?.finish_reason),
    };
  },
};
