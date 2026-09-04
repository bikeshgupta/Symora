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

/**
 * Where the turn came from. Voice matters to the risk gate specifically: speech-to-text
 * confuses digits, and "forty-two thousand five hundred" coming back as 42,000 is a
 * plausible-looking wrong number that nothing downstream can catch.
 */
export type TurnSource = 'chat' | 'voice' | 'paste';

/** Argument names that carry a monetary value across the twelve V1 intents. */
const MONETARY_ARG_KEYS = ['amount', 'paidAmount', 'expectedAmount'];

export function hasMonetaryArgument(args: Record<string, unknown> | null | undefined): boolean {
  if (!args) return false;
  return MONETARY_ARG_KEYS.some((key) => {
    const value = args[key];
    return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  });
}

/**
 * .claude/rules/ai-pipeline.md lists "any monetary amount extracted from voice" as an
 * always-confirm case, independent of confidence and independent of whether the intent
 * is high-impact on its own. This is that rule, as a pure function.
 */
export function requiresSourceConfirmation(
  source: TurnSource,
  args: Record<string, unknown> | null | undefined,
): boolean {
  if (source === 'voice' && hasMonetaryArgument(args)) return true;
  // Anything derived from pasted third-party content is always confirmed; the chat
  // handler routes paste through its own branch, and this keeps the rule true here too.
  return source === 'paste';
}

export interface DecisionInput {
  confidence: number;
  isHighImpact: boolean;
  source: TurnSource;
  args: Record<string, unknown> | null | undefined;
  /** True when the turn used a relative date whose direction context cannot settle. */
  hasUnresolvedRelativeDate?: boolean;
}

/**
 * The full gate, combining both rules above with the two in `decide`.
 *
 * An unsettled relative date is a comprehension failure, not a risk one, so it clarifies
 * rather than confirming: showing a confirmation card with a date Symora guessed invites
 * the user to skim past a wrong value, whereas a question makes them state it.
 */
export function decideTurn(input: DecisionInput): PipelineDecision {
  if (input.hasUnresolvedRelativeDate) return 'clarify';
  if (input.confidence < CONFIDENCE_THRESHOLD) return 'clarify';
  if (input.isHighImpact) return 'confirm';
  if (requiresSourceConfirmation(input.source, input.args)) return 'confirm';
  return 'proceed';
}
