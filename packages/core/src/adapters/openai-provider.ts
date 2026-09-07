/**
 * The only place the `openai` SDK is imported (.claude/rules/ai-pipeline.md § Provider
 * and model use: "No provider SDK is imported anywhere outside its adapter
 * implementation").
 *
 * Despite the filename this is not tied to OpenAI. It speaks the OpenAI-compatible HTTP
 * API, which Ollama, vLLM, LM Studio, llama.cpp's server, Groq and Together all
 * implement, so `AI_BASE_URL` is enough to point Symora at a model running on a machine
 * you own. Model ids come from `AI_MODEL_CHEAP` / `AI_MODEL_STRONG` rather than being
 * hardcoded, so this file does not go stale as models change.
 *
 * Two things here exist specifically because the endpoint may be self-hosted:
 *
 * 1. **A JSON fallback for structured output.** Tool-calling support among small open
 *    models is inconsistent. When native tools are refused, the same request is made as
 *    a JSON object matching a schema described in the prompt, and the reply is mapped
 *    back into a tool call — so nothing above the AIProvider boundary can tell which was
 *    used.
 * 2. **A circuit breaker.** A machine you own is sometimes off. See provider-health.ts.
 */

import OpenAI from 'openai';
import {
  getAiEndpointConfig,
  getAiModel,
  getAiCooldownMs,
  getAiMaxRetries,
  readTimeoutMs,
  type AiToolMode,
} from '../config/ai-config';
import { ProviderHealth, type ProviderHealthSnapshot } from './provider-health';
import type {
  AICompletionRequest,
  AICompletionResult,
  AIMessage,
  AIProvider,
  AIToolCall,
  AIToolDefinition,
} from './ai-provider';

export { readTimeoutMs };

/**
 * Parameters a given model turned down, remembered for the life of the process.
 *
 * Newer reasoning families take only the default temperature and want
 * `max_completion_tokens` where the older chat models took `max_tokens`; many
 * self-hosted servers accept neither `tools` nor `json_schema`. Which model refuses what
 * changes with every release, and this adapter is deliberately model-agnostic — the ids
 * come from env precisely so it does not go stale. So instead of a hardcoded model list,
 * send what the caller asked for, read the parameter named in the 400, and retry once
 * without it. One extra round-trip per model per process, and no list to maintain.
 */
const rejectedParams = new Map<string, Set<AdjustableParam>>();

type AdjustableParam = 'temperature' | 'max_tokens' | 'tools' | 'response_format';

const TOOL_REFUSAL =
  /tool|function|does not support tools|tool_choice|unsupported.*tool|no tool support/i;

/**
 * Which parameter a 400 was complaining about.
 *
 * `err.param` is the reliable signal when the server sets it — OpenAI does. Self-hosted
 * servers frequently do not, so a tool-shaped message is also read as a tool refusal;
 * the cost of being wrong is one retry in the other mode, and the cost of not doing it
 * is that the model never works at all.
 */
function unsupportedParam(err: unknown): AdjustableParam | null {
  if (!(err instanceof OpenAI.APIError) || err.status !== 400) return null;

  if (err.param === 'temperature' || err.param === 'max_tokens') return err.param;
  if (err.param === 'tools' || err.param === 'tool_choice') return 'tools';
  if (err.param === 'response_format') return 'response_format';

  if (typeof err.message === 'string' && TOOL_REFUSAL.test(err.message)) return 'tools';
  return null;
}

let client: OpenAI | null = null;
let clientBaseUrl: string | undefined;

function getClient(): OpenAI {
  const config = getAiEndpointConfig();
  // The base URL is configuration, and configuration changes between tests and between
  // a warm instance's deployments. Rebuilding when it moves is cheaper than a stale
  // client silently talking to the previous endpoint.
  if (client && clientBaseUrl === config.baseUrl) return client;

  if (!config.baseUrl && !process.env.AI_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      'Set AI_API_KEY (or OPENAI_API_KEY) to use the hosted API, or AI_BASE_URL to point ' +
        'at a model you run yourself.',
    );
  }

  // maxRetries is explicit because the SDK's default of 2 silently triples the request
  // timeout, and the timeout is what keeps a turn inside the function's budget
  // (config/ai-config.ts § DEFAULT_AI_MAX_RETRIES).
  client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: getAiMaxRetries(),
  });
  clientBaseUrl = config.baseUrl;
  return client;
}

/** Test-only: drop the cached client so a changed base URL is picked up immediately. */
export function resetAiClient(): void {
  client = null;
  clientBaseUrl = undefined;
}

function modelForTier(tier: AICompletionRequest['tier']): string {
  const model = getAiModel(tier);
  if (!model) {
    throw new Error(
      `AI_MODEL_${tier === 'cheap' ? 'CHEAP' : 'STRONG'} must be set to use the ${tier} model tier.`,
    );
  }
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

/**
 * Pulls a JSON object out of a reply that wrapped it in prose or a fenced block.
 *
 * Strict JSON mode is not universally honoured by self-hosted servers, and a model that
 * says "Sure! ```json {…}```" has still done the work. Recovering it is worth a few
 * lines; the result is validated by the tool registry's Zod schema either way, so a
 * wrong shape is rejected exactly as it would be from any other source.
 */
function extractJsonObject(text: string | null | undefined): unknown {
  const direct = safeJsonParse(text);
  if (direct !== null) return direct;
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return safeJsonParse(candidate?.trim());
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

// ---------------------------------------------------------------------------
// JSON tool mode
// ---------------------------------------------------------------------------

/**
 * The instruction that replaces native tool calling.
 *
 * The envelope is described here in prose rather than also declared as a JSON schema
 * object: `response_format` is set to `json_object` rather than `json_schema` because
 * the former is far more widely supported among self-hosted servers, so a second
 * machine-readable copy of the shape would never be sent anywhere and would only drift.
 *
 * Appended as a system message rather than folded into the caller's prompt so the
 * pipeline's own system prompt stays readable and provider-agnostic — this is a
 * transport detail, and it belongs with the transport.
 */
function jsonModeInstruction(tools: AIToolDefinition[]): string {
  const catalogue = tools
    .map((tool) => `- ${tool.name}: ${tool.description}\n  arguments: ${JSON.stringify(tool.parameters)}`)
    .join('\n');

  return [
    'Reply with a single JSON object and nothing else. No prose, no code fence.',
    'The object has exactly these keys: "tool" (a tool name from the list below, or null),',
    '"args" (an object of arguments for that tool, omitted when tool is null), and',
    '"text" (your plain-text reply, used only when tool is null).',
    'Choose at most one tool. If nothing in the list fits, set tool to null and answer in "text".',
    'Never invent a tool name that is not listed.',
    '',
    'Available tools:',
    catalogue,
  ].join('\n');
}

/** Turns a JSON-mode reply into the tool call shape the pipeline already understands. */
function toolCallsFromJson(parsed: unknown, tools: AIToolDefinition[]): AIToolCall[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const envelope = parsed as { tool?: unknown; args?: unknown };
  if (typeof envelope.tool !== 'string' || envelope.tool.length === 0) return [];

  // A name outside the registry is dropped here rather than passed on. The orchestrator
  // would reject it anyway, but a tool call that never existed should not reach it.
  if (!tools.some((tool) => tool.name === envelope.tool)) return [];

  return [
    {
      id: 'json-mode',
      name: envelope.tool,
      arguments: envelope.args && typeof envelope.args === 'object' ? envelope.args : {},
    },
  ];
}

function textFromJson(parsed: unknown, fallback: string | null): string | null {
  if (parsed && typeof parsed === 'object') {
    const envelope = parsed as { text?: unknown };
    if (typeof envelope.text === 'string' && envelope.text.trim() !== '') return envelope.text;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

function buildBody(
  model: string,
  request: AICompletionRequest,
  useJsonToolMode: boolean,
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const rejected = rejectedParams.get(model) ?? new Set<AdjustableParam>();
  const tools = request.tools ?? [];
  const jsonMode = useJsonToolMode && tools.length > 0;

  const messages = jsonMode
    ? [
        ...toOpenAiMessages(request.messages).slice(0, 1),
        { role: 'system' as const, content: jsonModeInstruction(tools) },
        ...toOpenAiMessages(request.messages).slice(1),
      ]
    : toOpenAiMessages(request.messages);

  const body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = { model, messages };

  if (!jsonMode && tools.length > 0 && !rejected.has('tools')) {
    body.tools = tools.map((tool) => ({
      type: 'function' as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
  }

  if (!rejected.has('response_format')) {
    if (jsonMode) {
      // json_object is far more widely supported than json_schema among self-hosted
      // servers, and the schema is already in the prompt above.
      body.response_format = { type: 'json_object' };
    } else if (request.responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'response', schema: request.responseSchema, strict: false },
      };
    }
  }

  if (!rejected.has('temperature')) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined) {
    if (rejected.has('max_tokens')) body.max_completion_tokens = request.maxOutputTokens;
    else body.max_tokens = request.maxOutputTokens;
  }

  return body;
}

function remember(model: string, param: AdjustableParam): void {
  const rejected = rejectedParams.get(model) ?? new Set<AdjustableParam>();
  rejected.add(param);
  rejectedParams.set(model, rejected);
}

interface CompletionAttempt {
  response: OpenAI.Chat.ChatCompletion;
  usedJsonToolMode: boolean;
}

async function createCompletion(
  model: string,
  request: AICompletionRequest,
  timeoutMs: number,
  toolMode: AiToolMode,
): Promise<CompletionAttempt> {
  const rejected = rejectedParams.get(model) ?? new Set<AdjustableParam>();
  const useJsonToolMode = toolMode === 'json' || (toolMode !== 'native' && rejected.has('tools'));

  try {
    const response = await getClient().chat.completions.create(
      buildBody(model, request, useJsonToolMode),
      { timeout: timeoutMs },
    );
    return { response, usedJsonToolMode: useJsonToolMode };
  } catch (err) {
    const param = unsupportedParam(err);
    // Only ever retry for a parameter this model has not already refused, so the
    // recursion is bounded by the size of AdjustableParam.
    if (!param || rejected.has(param)) throw err;
    // `native` is an explicit instruction not to fall back to JSON; honour it rather
    // than quietly doing the thing the operator ruled out.
    if (param === 'tools' && toolMode === 'native') throw err;

    remember(model, param);
    return createCompletion(model, request, timeoutMs, toolMode);
  }
}

// ---------------------------------------------------------------------------

const health = new ProviderHealth({ cooldownMs: getAiCooldownMs() });

/** The endpoint's current reachability, for `/api/me` and the request log. */
export function getProviderHealth(): ProviderHealthSnapshot {
  return health.snapshot();
}

/** Test-only: close the circuit and forget the last failure. */
export function resetProviderHealth(): void {
  health.reset();
}

export const openAiProvider: AIProvider = {
  name: 'openai-compatible',

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const model = modelForTier(request.tier);
    const config = getAiEndpointConfig();
    const timeoutMs = request.timeoutMs ?? config.timeoutMs;

    // Throws immediately while the circuit is open, so a turn made during an outage
    // reaches the rule-based parser in milliseconds instead of after a full timeout.
    health.assertAvailable();

    let attempt: CompletionAttempt;
    try {
      attempt = await createCompletion(model, request, timeoutMs, config.toolMode);
      health.recordSuccess();
    } catch (err) {
      health.recordFailure(err);
      throw err;
    }

    const { response, usedJsonToolMode } = attempt;
    const choice = response.choices[0];
    const message = choice?.message;

    const nativeToolCalls: AIToolCall[] = (message?.tool_calls ?? [])
      .filter((call) => call.type === 'function')
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeJsonParse(call.function.arguments),
      }));

    const jsonEnvelope = usedJsonToolMode ? extractJsonObject(message?.content) : null;
    const toolCalls =
      nativeToolCalls.length > 0 ? nativeToolCalls : toolCallsFromJson(jsonEnvelope, request.tools ?? []);

    const text = usedJsonToolMode
      ? textFromJson(jsonEnvelope, toolCalls.length > 0 ? null : (message?.content ?? null))
      : (message?.content ?? null);

    const structured = request.responseSchema ? (jsonEnvelope ?? safeJsonParse(message?.content)) : null;
    const usage = response.usage;

    return {
      text,
      toolCalls,
      structured,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
        // Cost estimation needs a per-model pricing table, and a model you host
        // yourself has no per-request price at all. Left unset rather than invented.
        estimatedCostUsd: undefined,
      },
      model: response.model || model,
      // A JSON-mode reply that produced a tool call finished for the same reason a
      // native one would; reporting the raw 'stop' would make the two look different
      // to everything downstream.
      finishReason:
        usedJsonToolMode && toolCalls.length > 0 ? 'tool_calls' : mapFinishReason(choice?.finish_reason),
    };
  },
};
