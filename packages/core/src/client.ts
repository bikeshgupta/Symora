/**
 * The browser-safe entry point: `@symora/core/client`.
 *
 * The root barrel reaches repositories, the Supabase client and the OpenAI SDK, so
 * importing a *value* from it in the PWA drags server code into the bundle — and, since
 * the config layer reads `process.env` at module scope, straight into a "process is not
 * defined" at runtime. Type-only imports are erased and are fine from anywhere; anything
 * the browser actually executes comes from here.
 *
 * Everything exported here must be pure and dependency-free. If a value needs a
 * repository, a provider or configuration, it belongs behind an API endpoint instead —
 * the browser is not where truth lives (.claude/rules/ai-pipeline.md).
 */

export {
  capabilitySuggestions,
  type CapabilitySuggestion,
} from './ai/orchestrator/small-talk';
