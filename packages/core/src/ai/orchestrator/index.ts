export { detectLanguage } from './language';
export { extractIntent, type ExtractionResult } from './intent-extraction';
export { decide, CONFIDENCE_THRESHOLD, type PipelineDecision } from './confidence-risk';
export {
  composeConversational,
  composeConfirmation,
  composeToolResult,
  type ComposedResponse,
} from './response-composer';
