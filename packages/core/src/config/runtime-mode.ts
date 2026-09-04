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

export type AiMode = 'ai' | 'offline';

export interface RuntimeCapabilities {
  aiMode: AiMode;
  /** Server-side speech-to-text. Offline mode uses the browser's own recogniser. */
  serverTranscription: boolean;
  /** Message drafting quality differs by mode, and the UI says so. */
  draftingIsTemplated: boolean;
}

export function getAiMode(env: NodeJS.ProcessEnv = process.env): AiMode {
  // Both are required for the model path: a key with no model id configured would fail
  // on the first call, which is a worse experience than never leaving offline mode.
  return env.OPENAI_API_KEY && env.AI_MODEL_CHEAP ? 'ai' : 'offline';
}

export function getRuntimeCapabilities(env: NodeJS.ProcessEnv = process.env): RuntimeCapabilities {
  const aiMode = getAiMode(env);
  return {
    aiMode,
    serverTranscription: aiMode === 'ai' && Boolean(env.OPENAI_API_KEY),
    draftingIsTemplated: aiMode === 'offline',
  };
}
