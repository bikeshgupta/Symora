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

import { getAiBaseUrl, getAiApiKey, isAiConfigured } from './ai-config';

export type AiMode = 'ai' | 'offline';

/**
 * Whether the configured endpoint is actually answering right now.
 *
 * Distinct from the mode: `offline` means nothing is configured, `unreachable` means
 * something is configured and is not responding. The second is the normal state of a
 * model running on a machine the user switches off, and the two deserve different words
 * in front of a user — "not set up" and "your model is asleep" are not the same problem.
 */
export type ModelStatus = 'offline' | 'ready' | 'unreachable';

export interface RuntimeCapabilities {
  aiMode: AiMode;
  /** Live reachability of the model endpoint. */
  modelStatus: ModelStatus;
  /** True when the endpoint is a deployment the user runs, rather than a hosted API. */
  selfHostedModel: boolean;
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
}

export function getRuntimeCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  options: CapabilityOptions = {},
): RuntimeCapabilities {
  const aiMode = getAiMode(env);
  const modelStatus: ModelStatus =
    aiMode === 'offline' ? 'offline' : options.modelReachable === false ? 'unreachable' : 'ready';

  return {
    aiMode,
    modelStatus,
    selfHostedModel: Boolean(getAiBaseUrl(env)),
    // Server transcription goes to the same endpoint, so it needs a key: a self-hosted
    // chat model is not necessarily a speech model, and claiming otherwise would hand
    // the user a mic that silently fails.
    serverTranscription: aiMode === 'ai' && Boolean(getAiApiKey(env)) && !getAiBaseUrl(env),
    // Templated whenever the model cannot actually be reached, not merely when none is
    // configured — a draft the user is about to send should never be described as better
    // than it is.
    draftingIsTemplated: modelStatus !== 'ready',
  };
}
