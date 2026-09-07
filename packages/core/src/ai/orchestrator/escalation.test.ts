import { describe, expect, it } from 'vitest';
import { CLEAR_RULE_MATCH, decideEscalation } from './escalation';
import { extractIntentOffline } from '../offline/rule-parser';
import { buildTemporalAnchors } from '../../domain/temporal/temporal-context';
import { validateToolArgs } from '../tools/registry';

const validate = (intent: Parameters<typeof validateToolArgs>[0], args: unknown) =>
  validateToolArgs(intent, args).ok;

function decide(offline: { intent: null | Parameters<typeof validateToolArgs>[0]; args: unknown; confidence: number }) {
  return decideEscalation({ offline, policy: 'when-needed', validate });
}

describe('decideEscalation', () => {
  it('asks the model when the rule parser recognised nothing', () => {
    expect(decide({ intent: null, args: null, confidence: 0 })).toEqual({
      escalate: true,
      reason: 'no-rule-match',
    });
  });

  it('asks the model when the parser is unsure, however plausible the match', () => {
    // 0.75 is the parser's "likely": a pattern matched but something was inferred. This
    // is the case that produced a task titled "Home loan i pay 5th of month" — precisely
    // where a model earns its request.
    const decision = decide({
      intent: 'create_task',
      args: { title: 'Home loan i pay 5th of month', confidence: 0.75 },
      confidence: 0.75,
    });
    expect(decision).toEqual({ escalate: true, reason: 'unsure-rule-match' });
  });

  it('asks the model when a confident match produced arguments the tool would reject', () => {
    const decision = decide({
      intent: 'create_financial_obligation',
      args: { accountName: 'Home loan', confidence: CLEAR_RULE_MATCH },
      confidence: CLEAR_RULE_MATCH,
    });
    expect(decision).toEqual({ escalate: true, reason: 'incomplete-rule-match' });
  });

  it('spends nothing on a clear, complete match', () => {
    const decision = decide({
      intent: 'create_task',
      args: { title: 'Call the electrician', dueDate: '2026-09-08', confidence: CLEAR_RULE_MATCH },
      confidence: CLEAR_RULE_MATCH,
    });
    expect(decision).toEqual({ escalate: false, reason: 'rule-match-is-enough' });
  });

  it('accepts a merely likely match for a read, which writes nothing', () => {
    const decision = decide({ intent: 'list_pending', args: { type: 'ALL', confidence: 0.75 }, confidence: 0.75 });
    expect(decision.escalate).toBe(false);
  });

  it('still asks the model for a read it is genuinely unsure about', () => {
    const decision = decide({ intent: 'list_pending', args: { type: 'ALL', confidence: 0.4 }, confidence: 0.4 });
    expect(decision).toEqual({ escalate: true, reason: 'unsure-rule-match' });
  });

  it('always asks the model when the deployment says to', () => {
    const decision = decideEscalation({
      offline: { intent: 'create_task', args: { title: 'Call the electrician', confidence: 0.95 }, confidence: 0.95 },
      policy: 'always',
      validate,
    });
    expect(decision).toEqual({ escalate: true, reason: 'policy-always' });
  });
});

/**
 * The decision is only worth having if the sentences people actually type fall on the
 * side it claims. These are the five the greeting offers as examples plus the everyday
 * read — the exact turns a rationed free tier should not be spent on.
 */
describe('what a month of ordinary use costs', () => {
  const temporal = buildTemporalAnchors(new Date('2026-09-07T06:00:00.000Z'), 'Asia/Kolkata');
  const decideFor = (text: string) =>
    decideEscalation({
      offline: extractIntentOffline(text, 'en', { temporal }),
      policy: 'when-needed',
      validate,
    });

  it.each([
    'Home loan 42500 every month on the 5th',
    'Paid the electricity bill today',
    'Remind me to call the doctor tomorrow',
    'Remember my landlord is Rakesh Sharma',
    'what is pending?',
    'How much do I need this month?',
  ])('answers "%s" without a model request', (text) => {
    expect(decideFor(text).escalate).toBe(false);
  });

  it.each([
    'Home loan i pay 5th of every month',
    'sort out the thing with the flat before it gets awkward',
    'can you check whether the rent went out last week',
  ])('spends one on "%s", which is what a model is for', (text) => {
    expect(decideFor(text).escalate).toBe(true);
  });
});
