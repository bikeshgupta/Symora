export { detectLanguage } from './language';
export { extractIntent, type ExtractionResult, type ExtractIntentOptions } from './intent-extraction';
export { buildMemoryContext, type MemoryContextEntry } from './memory-context';
export { decide, CONFIDENCE_THRESHOLD, type PipelineDecision } from './confidence-risk';
export {
  composeConversational,
  composeConfirmation,
  composeToolResult,
  type ComposedResponse,
} from './response-composer';
