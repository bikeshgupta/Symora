/**
 * Everything Symora needs to know about the model endpoint, read from configuration in
 * one place.
 *
 * The point of this file is that the endpoint is *not* assumed to be OpenAI. Ollama,
 * vLLM, LM Studio, llama.cpp's server, Groq and Together all speak the same
 * OpenAI-compatible HTTP API, so pointing Symora at a model running on your own machine
 * is `AI_BASE_URL=https://…/v1` and nothing else. That is the whole reason the settings
 * are named `AI_*` rather than `OPENAI_*`: the provider is a deployment choice, and the
 * configuration should not imply otherwise.
 *
 * `OPENAI_API_KEY` is still read, so an existing deployment keeps working unchanged.
 */

/** Where the OpenAI-compatible API lives. Undefined means OpenAI's own endpoint. */
export function getAiBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.AI_BASE_URL?.trim();
  if (!raw) return undefined;
  // A trailing slash produces '…/v1//chat/completions' on some servers, which 404s.
  return raw.replace(/\/+$/, '');
}

/**
 * The API key, preferring `AI_API_KEY` and falling back to `OPENAI_API_KEY`.
 *
 * Undefined is a legitimate answer: a model on your own machine behind a private tunnel
 * may have no auth at all. See `getAiApiKeyForClient` for what is actually sent.
 */
export function getAiApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.AI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || undefined;
}

/**
 * What the SDK is handed. The OpenAI client refuses to construct without a key, so a
 * self-hosted endpoint with no auth gets a placeholder — servers that do not check the
 * header ignore it, and servers that do should be given a real `AI_API_KEY`.
 *
 * Sending a placeholder to OpenAI itself is not possible: `getAiMode` below requires a
 * real key whenever no base URL is set.
 */
export function getAiApiKeyForClient(env: NodeJS.ProcessEnv = process.env): string {
  return getAiApiKey(env) ?? 'no-auth';
}

/**
 * Endpoints that are somebody else's hosted API rather than a machine the user runs.
 *
 * `AI_BASE_URL` was originally only ever set for a self-hosted model, so its presence
 * was a fair proxy for "this is your own machine". Gemini broke that: it is reached
 * through the same OpenAI-compatible base URL, and calling it "your own model" in the UI
 * would send someone to switch on a laptop that has nothing to do with it. Hosts are
 * matched by suffix so regional subdomains resolve the same way.
 */
const HOSTED_PROVIDERS: { suffix: string; label: string }[] = [
  { suffix: 'googleapis.com', label: 'Gemini' },
  { suffix: 'openai.com', label: 'OpenAI' },
  { suffix: 'anthropic.com', label: 'Claude' },
  { suffix: 'groq.com', label: 'Groq' },
  { suffix: 'together.xyz', label: 'Together' },
  { suffix: 'together.ai', label: 'Together' },
  { suffix: 'mistral.ai', label: 'Mistral' },
  { suffix: 'openrouter.ai', label: 'OpenRouter' },
  { suffix: 'deepseek.com', label: 'DeepSeek' },
  { suffix: 'perplexity.ai', label: 'Perplexity' },
];

function hostOf(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostedProvider(baseUrl: string | undefined): { suffix: string; label: string } | undefined {
  const host = hostOf(baseUrl);
  if (!host) return undefined;
  return HOSTED_PROVIDERS.find(
    (provider) => host === provider.suffix || host.endsWith(`.${provider.suffix}`),
  );
}

/**
 * Whether the endpoint is a deployment the user runs. Only this decides whether the UI
 * talks about "your own model" — a phrase that has to be true to be useful.
 */
export function isSelfHostedEndpoint(env: NodeJS.ProcessEnv = process.env): boolean {
  const baseUrl = getAiBaseUrl(env);
  if (!baseUrl) return false;
  return hostedProvider(baseUrl) === undefined;
}

/**
 * What to call the model layer in front of a user. A name they recognise beats "the AI
 * provider" when the next step is to go and look at a quota page.
 */
export function getModelProviderLabel(env: NodeJS.ProcessEnv = process.env): string {
  const baseUrl = getAiBaseUrl(env);
  if (!baseUrl) return 'OpenAI';
  return hostedProvider(baseUrl)?.label ?? 'your own model';
}

/**
 * When to spend a model request (ai/orchestrator/escalation.ts).
 *
 * `when-needed` is the default because the endpoints most people can actually point at
 * — a free tier, a laptop — are rationed, and most everyday sentences are ones the rule
 * parser matches exactly. `always` restores per-turn model use.
 */
export type AiCallPolicy = 'when-needed' | 'always';

export function getAiCallPolicy(env: NodeJS.ProcessEnv = process.env): AiCallPolicy {
  return env.AI_CALL_POLICY?.trim().toLowerCase() === 'always' ? 'always' : 'when-needed';
}

export type AiModelTierName = 'cheap' | 'strong';

export function getAiModel(
  tier: AiModelTierName,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (tier === 'cheap' ? env.AI_MODEL_CHEAP : env.AI_MODEL_STRONG)?.trim() || undefined;
}

/**
 * How the model is asked for structured output.
 *
 * - `native` — the endpoint's own tool/function calling. What OpenAI and the larger
 *   open models do well.
 * - `json` — a JSON object matching a schema described in the prompt, mapped back into
 *   a tool call inside the adapter. Slower to write but supported almost everywhere.
 * - `auto` (default) — try native, and remember a model that rejects it.
 *
 * This exists because tool-calling support among small self-hosted models is genuinely
 * inconsistent, and finding out by watching every request fail is a poor way to learn.
 */
export type AiToolMode = 'native' | 'json' | 'auto';

export function getAiToolMode(env: NodeJS.ProcessEnv = process.env): AiToolMode {
  const raw = env.AI_TOOL_MODE?.trim().toLowerCase();
  return raw === 'native' || raw === 'json' ? raw : 'auto';
}

/**
 * How long to wait for the model before giving up and using the rule-based parser.
 *
 * The default is deliberately well below the serverless function's own ceiling
 * (`maxDuration` in vercel.json). If the platform kills the function first, the user
 * gets a raw 504 instead of Symora's graceful "I couldn't reach my model, here is what I
 * understood anyway" — the fallback never runs. A self-hosted model on a CPU is exactly
 * the case where that ordering matters, because it is the slow one.
 */
export const DEFAULT_AI_TIMEOUT_MS = 12_000;

/**
 * A configured-but-blank env var is the normal shape of a half-filled `.env`, and `??`
 * does not catch it: `Number('')` is 0, which an SDK reads as "time out immediately"
 * rather than "not configured". Anything non-numeric or non-positive falls back to the
 * default instead of silently becoming a broken timeout.
 */
export function readTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

export function getAiTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return readTimeoutMs(env.AI_REQUEST_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS);
}

/**
 * How many times the SDK may repeat a failed request of its own accord.
 *
 * **Zero, and that is a fix rather than a preference.** The OpenAI SDK retries twice by
 * default and applies `timeout` *per attempt*, so a 12s timeout was really a 36s worst
 * case — past the serverless function's own ceiling. The platform then killed the
 * invocation, which meant a raw 500 for the user, no fallback to the rule parser, and no
 * failure recorded, so the circuit breaker never opened and the next turn did it again.
 * Every chat turn died that way while every deterministic endpoint kept working.
 *
 * Retrying is also the wrong shape here: this layer already has a better answer than
 * waiting — the rule-based parser — and a turn the user is watching should degrade in
 * seconds rather than retry silently for half a minute. Raise it only with a request
 * timeout small enough that attempts × timeout still fits the function's budget.
 */
export const DEFAULT_AI_MAX_RETRIES = 0;

export function getAiMaxRetries(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AI_MAX_RETRIES?.trim();
  if (!raw) return DEFAULT_AI_MAX_RETRIES;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_AI_MAX_RETRIES;
}

/**
 * The whole turn's model budget, across every call it makes.
 *
 * `AI_REQUEST_TIMEOUT_MS` bounds one call; this bounds the turn. They differ because a
 * turn is not always one call — interpreting pasted text extracts twice — and two calls
 * that each honour a 12s timeout still exceed a 30s function. Whatever is left of this
 * budget is what the next call is given, and when too little remains the model is
 * skipped entirely and the rule parser answers. The user gets a real reply either way;
 * that is the whole point of having a deterministic path.
 *
 * Keep it comfortably under `maxDuration` in vercel.json — the rest of the turn still
 * has to write its messages and compose a response after the model answers.
 */
export const DEFAULT_AI_TURN_BUDGET_MS = 20_000;

export function getAiTurnBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  return readTimeoutMs(env.AI_TURN_BUDGET_MS, DEFAULT_AI_TURN_BUDGET_MS);
}

/**
 * How long the circuit stays open after the endpoint fails. See
 * adapters/provider-health.ts — this is the "your laptop is off" window, during which
 * turns go straight to the rule parser instead of waiting for a timeout each time.
 */
export const DEFAULT_AI_COOLDOWN_MS = 60_000;

export function getAiCooldownMs(env: NodeJS.ProcessEnv = process.env): number {
  return readTimeoutMs(env.AI_UNREACHABLE_COOLDOWN_MS, DEFAULT_AI_COOLDOWN_MS);
}

/**
 * Whether the model path is configured at all.
 *
 * A model id is always required — a key with no model would fail on the first call,
 * which is a worse experience than never leaving offline mode. Beyond that the rule
 * differs by where the endpoint is:
 *
 * - No base URL means OpenAI, which cannot work without a real key.
 * - A base URL means a deployment you control, which may legitimately have no auth.
 */
export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!getAiModel('cheap', env)) return false;
  return Boolean(getAiBaseUrl(env)) || Boolean(getAiApiKey(env));
}

/** Everything the adapter needs, resolved once. */
export interface AiEndpointConfig {
  baseUrl: string | undefined;
  apiKey: string;
  toolMode: AiToolMode;
  timeoutMs: number;
}

export function getAiEndpointConfig(env: NodeJS.ProcessEnv = process.env): AiEndpointConfig {
  return {
    baseUrl: getAiBaseUrl(env),
    apiKey: getAiApiKeyForClient(env),
    toolMode: getAiToolMode(env),
    timeoutMs: getAiTimeoutMs(env),
  };
}
