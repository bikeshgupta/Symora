/**
 * The two independent gates from .claude/rules/ai-pipeline.md § Confidence and
 * confirmation: confidence is "did I understand?", risk is "how bad is it if I'm
 * wrong?". Low confidence always wins (never guess a value, never write); a
 * high-impact write always needs confirmation regardless of how confident the model
 * was. Pure function — the registry supplies `isHighImpact` per intent, this file
 * never hardcodes intent names itself.
 */

export const CONFIDENCE_THRESHOLD = 0.6;

export type PipelineDecision = 'clarify' | 'confirm' | 'proceed';

export function decide(confidence: number, isHighImpact: boolean): PipelineDecision {
  if (confidence < CONFIDENCE_THRESHOLD) return 'clarify';
  if (isHighImpact) return 'confirm';
  return 'proceed';
}
