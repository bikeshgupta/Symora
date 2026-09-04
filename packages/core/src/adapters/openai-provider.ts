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

/**
 * A configured-but-blank env var is the normal shape of a half-filled `.env`, and
 * `??` does not catch it: `Number('')` is 0, which the SDK reads as "time out
 * immediately" rather than "not configured". Anything non-numeric or non-positive
 * falls back to the default instead of silently becoming a broken timeout.
 */
export function readTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

/**
 * Parameters a given model turned down, remembered for the life of the process.
 *
 * Newer reasoning families take only the default temperature and want
 * `max_completion_tokens` where the older chat models took `max_tokens`. Which model
 * refuses what changes with every release, and this adapter is deliberately
 * model-agnostic — the ids come from env precisely so it does not go stale. So instead
 * of a hardcoded model list, send what the caller asked for, read the parameter named
 * in OpenAI's 400, and retry once without it. One extra round-trip per model per
 * process, and no list to maintain.
 */
const rejectedParams = new Map<string, Set<AdjustableParam>>();

type AdjustableParam = 'temperature' | 'max_tokens';

function unsupportedParam(err: unknown): AdjustableParam | null {
  if (!(err instanceof OpenAI.APIError) || err.status !== 400) return null;
  return err.param === 'temperature' || err.param === 'max_tokens' ? err.param : null;
}

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

async function createCompletion(
  model: string,
  request: AICompletionRequest,
  timeoutMs: number,
): Promise<OpenAI.Chat.ChatCompletion> {
  const rejected = rejectedParams.get(model) ?? new Set<AdjustableParam>();

  const body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: toOpenAiMessages(request.messages),
    tools: request.tools?.map((tool) => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    response_format: request.responseSchema
      ? { type: 'json_schema', json_schema: { name: 'response', schema: request.responseSchema, strict: false } }
      : undefined,
  };
  if (!rejected.has('temperature')) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined) {
    if (rejected.has('max_tokens')) body.max_completion_tokens = request.maxOutputTokens;
    else body.max_tokens = request.maxOutputTokens;
  }

  try {
    return await getClient().chat.completions.create(body, { timeout: timeoutMs });
  } catch (err) {
    const param = unsupportedParam(err);
    // Only ever retry for a parameter this model has not already refused, so the
    // recursion is bounded by the size of AdjustableParam.
    if (!param || rejected.has(param)) throw err;
    rejected.add(param);
    rejectedParams.set(model, rejected);
    return createCompletion(model, request, timeoutMs);
  }
}

export const openAiProvider: AIProvider = {
  name: 'openai',

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const model = modelForTier(request.tier);
    const timeoutMs = request.timeoutMs ?? readTimeoutMs(process.env.AI_REQUEST_TIMEOUT_MS, 30_000);

    const response = await createCompletion(model, request, timeoutMs);

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
