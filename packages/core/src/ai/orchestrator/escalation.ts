/**
 * Whether this turn actually needs a model.
 *
 * Symora has two ways to understand a sentence: the deterministic rule parser in
 * `ai/offline/`, which is free and instant, and a model, which is neither. Until now the
 * choice between them was made once at deploy time — a configured provider meant every
 * turn went to it, including "Home loan 42500 every month on 5th", which the rule parser
 * matches exactly and completely.
 *
 * That is the wrong unit of decision when the provider has a quota, which every free
 * tier does. So the rule parser goes first on every turn and the model is asked only for
 * what it is genuinely better at: a sentence the parser did not recognise, recognised
 * only partially, or recognised into arguments that do not validate. Those are precisely
 * the turns where a model earns its cost, and they are a minority of everyday use.
 *
 * The bar is deliberately high. A *clear* rule match — the parser's own word for "every
 * required field was found" — proceeds without a model; anything less escalates, because
 * a half-matched sentence that becomes a task titled "Home loan i pay 5th of month" is a
 * worse outcome than spending one request. Reads are the one relaxation: they write
 * nothing, so acting on a merely likely match costs the user nothing but a re-ask.
 *
 * Nothing here decides what is *true* — the tool registry, the domain services and the
 * confirmation gates are identical either way. It only decides who reads the sentence.
 */

import type { IntentName } from '../../types/intents';
import type { AiCallPolicy } from '../../config/ai-config';
import { CONFIDENCE_THRESHOLD } from './confidence-risk';

/**
 * The rule parser's own "clear match" score: a pattern matched and every required field
 * was found. Below it the parser is reporting doubt, and doubt is what a model is for.
 */
export const CLEAR_RULE_MATCH = 0.9;

/**
 * Intents that only read. A wrong guess costs a re-ask, never a wrong row, so a merely
 * likely match is enough — the pipeline would act on the same number from a model.
 */
const READ_ONLY_INTENTS: ReadonlySet<IntentName> = new Set<IntentName>([
  'list_pending',
  'calculate_monthly_requirement',
]);

export type EscalationReason =
  /** Configured to always use the model. */
  | 'policy-always'
  /** The rule parser recognised no intent at all. */
  | 'no-rule-match'
  /** It recognised one, but reported doubt. */
  | 'unsure-rule-match'
  /** It recognised one confidently, but the arguments do not satisfy the tool schema. */
  | 'incomplete-rule-match'
  /** No model needed: a clear, complete match. */
  | 'rule-match-is-enough';

export interface EscalationDecision {
  escalate: boolean;
  reason: EscalationReason;
}

export interface EscalationInput {
  /** What the rule parser made of the text. */
  offline: { intent: IntentName | null; args: unknown; confidence: number };
  policy: AiCallPolicy;
  /**
   * The tool registry's own validation, passed in rather than imported so this stays a
   * pure decision: the same arguments the handler would receive, checked by the same
   * schema, before anything decides they are good enough to skip a model for.
   */
  validate: (intent: IntentName, args: unknown) => boolean;
  /** Overridable for a deployment that wants to trade quota for understanding. */
  clearEnough?: number;
}

export function decideEscalation(input: EscalationInput): EscalationDecision {
  if (input.policy === 'always') return { escalate: true, reason: 'policy-always' };

  const { intent, args, confidence } = input.offline;
  if (!intent) return { escalate: true, reason: 'no-rule-match' };

  const required = READ_ONLY_INTENTS.has(intent)
    ? CONFIDENCE_THRESHOLD
    : (input.clearEnough ?? CLEAR_RULE_MATCH);
  if (confidence < required) return { escalate: true, reason: 'unsure-rule-match' };

  if (!input.validate(intent, args)) return { escalate: true, reason: 'incomplete-rule-match' };

  return { escalate: false, reason: 'rule-match-is-enough' };
}
