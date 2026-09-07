/**
 * Which mode the server is running in.
 *
 * Symora is designed to be genuinely usable with no AI provider configured: every
 * deterministic feature — commitments, finance, memory, notifications, the home screen —
 * works either way, and the language-understanding layer falls back to the rule-based
 * parser in `ai/offline/`.
 *
 * The mode is derived from configuration, never from a request, and it only ever
 * *narrows* what the model layer can do. A client cannot ask for a mode.
 */

import {
  getAiApiKey,
  getAiBaseUrl,
  getModelProviderLabel,
  isAiConfigured,
  isSelfHostedEndpoint,
} from './ai-config';

export type AiMode = 'ai' | 'offline';

/**
 * Whether the configured endpoint is actually answering right now.
 *
 * Distinct from the mode: `offline` means nothing is configured, `unreachable` means
 * something is configured and is not responding. The second is the normal state of a
 * model running on a machine the user switches off, and the two deserve different words
 * in front of a user — "not set up" and "your model is asleep" are not the same problem.
 */
export type ModelStatus = 'offline' | 'ready' | 'unreachable' | 'rate_limited';

export interface RuntimeCapabilities {
  aiMode: AiMode;
  /** Live reachability of the model endpoint. */
  modelStatus: ModelStatus;
  /** True when the endpoint is a deployment the user runs, rather than a hosted API. */
  selfHostedModel: boolean;
  /**
   * What to call the model layer in front of a user — "Gemini", "OpenAI", "your own
   * model". A name someone recognises is the difference between a message they can act
   * on and one they cannot.
   */
  modelProvider: string;
  /** Server-side speech-to-text. Offline mode uses the browser's own recogniser. */
  serverTranscription: boolean;
  /** Message drafting quality differs by mode, and the UI says so. */
  draftingIsTemplated: boolean;
}

export function getAiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  return isAiConfigured(env) ? 'ai' : 'offline';
}

export interface CapabilityOptions {
  /**
   * The provider's reachability, passed in rather than imported so this module stays
   * pure configuration and the adapter stays the only thing that knows about the
   * network. Omitted means "not checked", which reads as ready.
   */
  modelReachable?: boolean;
  /**
   * Whether the endpoint is currently refusing for spending too fast. On a free tier
   * this is the ordinary end of a busy day and it clears by itself, which is a different
   * thing to tell a user than "not answering".
   */
  modelRateLimited?: boolean;
}

export function getRuntimeCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  options: CapabilityOptions = {},
): RuntimeCapabilities {
  const aiMode = getAiMode(env);
  const modelStatus: ModelStatus =
    aiMode === 'offline'
      ? 'offline'
      : options.modelRateLimited
        ? 'rate_limited'
        : options.modelReachable === false
          ? 'unreachable'
          : 'ready';

  return {
    aiMode,
    modelStatus,
    // A base URL used to mean "a machine of yours". Gemini is reached through one too,
    // and calling it "your own model" would send someone to switch on a laptop that has
    // nothing to do with it (config/ai-config.ts).
    selfHostedModel: isSelfHostedEndpoint(env),
    modelProvider: getModelProviderLabel(env),
    // Server transcription goes to OpenAI's own /audio/transcriptions, so it needs a
    // hosted OpenAI key and no base URL. A chat endpoint that speaks the OpenAI protocol
    // — Ollama, and Gemini's compatibility layer alike — is not a speech endpoint, and
    // claiming otherwise would hand the user a mic that silently fails. Those
    // deployments use the browser's own recogniser instead.
    serverTranscription: aiMode === 'ai' && Boolean(getAiApiKey(env)) && !getAiBaseUrl(env),
    // Templated whenever the model cannot actually be used, not merely when none is
    // configured — a draft the user is about to send should never be described as better
    // than it is.
    draftingIsTemplated: modelStatus !== 'ready',
  };
}
