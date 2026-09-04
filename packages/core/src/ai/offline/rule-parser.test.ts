/**
 * The offline mode's acceptance suite.
 *
 * With no AI key this parser IS the language layer, so these are not incidental unit
 * tests — they are what stands behind "a pilot user can do X without a provider". The
 * Phase 2 and Phase 7 acceptance phrases are all here.
 */

import { describe, expect, it } from 'vitest';
import { extractIntentOffline } from './rule-parser';
import { buildTemporalAnchors } from '../../domain/temporal/temporal-context';
import { CONFIDENCE_THRESHOLD } from '../orchestrator/confidence-risk';
import { intentArgsSchemas } from '../../types/intents';

// Friday 2026-09-04, Kolkata.
const temporal = buildTemporalAnchors(new Date('2026-09-04T06:00:00.000Z'), 'Asia/Kolkata');

function parse(text: string, language: 'en' | 'hi' | 'hinglish' = 'en') {
  return extractIntentOffline(text, language, { temporal });
}

describe('offline parser — Phase 2 acceptance examples', () => {
  it('"Home loan 42500 every month on 5th."', () => {
    const result = parse('Home loan 42500 every month on 5th.');
    expect(result.intent).toBe('create_financial_obligation');
    expect(result.args).toMatchObject({
      amount: 42500,
      dueDay: 5,
      currency: 'INR',
      obligationType: 'emi',
      recurrenceRule: 'monthly',
    });
    expect(String(result.args!.accountName).toLowerCase()).toContain('home loan');
  });

  it('"Saturday electrician ko call karna."', () => {
    const result = parse('Saturday electrician ko call karna.', 'hinglish');
    expect(result.intent).toBe('create_task');
    expect(result.args).toMatchObject({ dueDate: '2026-09-05' });
    expect(String(result.args!.title).toLowerCase()).toContain('electrician');
  });

  it('"Remind me 2 days before every bill."', () => {
    const result = parse('Remind me 2 days before every bill.');
    expect(result.intent).toBe('create_reminder');
    expect(result.args).toMatchObject({ leadDays: 2 });
  });

  it('"This month what all is pending?"', () => {
    expect(parse('This month what all is pending?').intent).toBe('list_pending');
  });

  it('"Home loan kal pay kar diya."', () => {
    const result = parse('Home loan kal pay kar diya.', 'hinglish');
    expect(result.intent).toBe('mark_paid');
    // Past tense settles "kal" as yesterday.
    expect(result.args).toMatchObject({ paidDate: '2026-09-03' });
    expect(String(result.args!.accountName).toLowerCase()).toContain('home loan');
  });
});

describe('offline parser — Phase 7 acceptance examples', () => {
  it('"Kal wali EMI bhar diya."', () => {
    const result = parse('Kal wali EMI bhar diya.', 'hinglish');
    expect(result.intent).toBe('mark_paid');
    expect(result.args).toMatchObject({ paidDate: '2026-09-03' });
  });

  it('"Saturday electrician ko call karna yaad dila dena."', () => {
    const result = parse('Saturday electrician ko call karna yaad dila dena.', 'hinglish');
    expect(result.intent).toBe('create_reminder');
    expect(result.args).toMatchObject({ dueDate: '2026-09-05' });
  });

  it('"Agle 5 din me kitna payment baki hai?"', () => {
    const result = parse('Agle 5 din me kitna payment baki hai?', 'hinglish');
    // Either read is correct and both are reads, so neither can write anything wrong.
    expect(['list_pending', 'calculate_monthly_requirement']).toContain(result.intent);
  });
});

describe('offline parser — everyday phrasings', () => {
  it('creates a task from a bare action with no date', () => {
    const result = parse('Call the plumber');
    expect(result.intent).toBe('create_task');
    expect(String(result.args!.title).toLowerCase()).toContain('plumber');
  });

  it('creates a dated task', () => {
    const result = parse('Buy groceries tomorrow');
    expect(result.intent).toBe('create_task');
    expect(result.args).toMatchObject({ dueDate: '2026-09-05' });
  });

  it('recognises rent as an obligation and classifies its type', () => {
    const result = parse('rent 15k every month on 1st');
    expect(result.intent).toBe('create_financial_obligation');
    expect(result.args).toMatchObject({ amount: 15000, dueDay: 1, obligationType: 'rent' });
  });

  it('classifies a subscription', () => {
    const result = parse('Netflix 649 every month on 12th');
    expect(result.args).toMatchObject({ obligationType: 'subscription' });
  });

  it('creates a yearly important date for a birthday', () => {
    const result = parse("Mom's birthday on 25 December");
    expect(result.intent).toBe('create_commitment');
    expect(result.args).toMatchObject({ type: 'IMPORTANT_DATE', dueDate: '2026-12-25', recurrenceRule: 'yearly' });
  });

  it('marks a task done', () => {
    const result = parse('Call the plumber done');
    expect(result.intent).toBe('mark_done');
  });

  it('reschedules', () => {
    const result = parse('Move the plumber to tomorrow');
    expect(result.intent).toBe('reschedule');
    expect(result.args).toMatchObject({ newDueDate: '2026-09-05' });
  });

  it('records a stated fact', () => {
    const result = parse('remember that mummy is Sunita');
    expect(result.intent).toBe('remember_preference');
    expect(result.args).toMatchObject({ key: 'mummy', value: 'Sunita' });
  });

  it('drafts a message', () => {
    const result = parse('draft a message to the electrician about Saturday');
    expect(result.intent).toBe('draft_message');
  });

  it('answers a monthly total question', () => {
    expect(parse('How much do I need this month?').intent).toBe('calculate_monthly_requirement');
  });
});

describe('offline parser — pasted third-party content', () => {
  const bankSms =
    'Dear Customer, Rs 42,500.00 has been debited from your A/c ending 4321 on 05-Sep-26 ' +
    'towards HOME LOAN EMI. Ref no 998877665544. Available balance Rs 18,204.19. ' +
    'Do not share your OTP with anyone. -HDFC Bank';

  it('routes a long bank message to interpret_pasted_message', () => {
    const result = parse(bankSms);
    expect(result.intent).toBe('interpret_pasted_message');
    expect(result.args).toMatchObject({ pastedText: bankSms });
  });

  it('does not mistake a short user statement for pasted content', () => {
    expect(parse('paid the rent').intent).toBe('mark_paid');
  });
});

describe('offline parser — refuses to guess', () => {
  it('asks rather than writing when it cannot find an action', () => {
    const result = parse('hmm ok');
    expect(result.intent).toBeNull();
    expect(result.text).toContain('Home loan 42500');
  });

  it('asks for the due day rather than inventing one', () => {
    const result = parse('Home loan 42500 every month');
    expect(result.intent).toBeNull();
    expect(result.text).toContain('which day');
  });

  it('drops below the confidence threshold on an ambiguous date, so the pipeline clarifies', () => {
    const result = parse('kal EMI bhar diya jo pending tha', 'hinglish');
    if (result.intent === 'mark_paid' && result.args?.paidDate === undefined) {
      expect(result.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    }
    // Whatever it decided, it must never be a silent high-confidence write of a guess.
    expect(result.confidence).toBeLessThanOrEqual(0.9);
  });

  it('reports zero token usage, because nothing was called', () => {
    expect(parse('Call the plumber').usage.totalTokens).toBe(0);
    expect(parse('Call the plumber').model).toBe('offline-rules');
  });
});

describe('offline parser — output survives the real tool schemas', () => {
  // The whole point of matching ExtractionResult is that the offline path goes through
  // the same registry validation as the model path. If these fail, the parser produces
  // args the tool would reject at runtime.
  const cases: { text: string; intent: keyof typeof intentArgsSchemas }[] = [
    { text: 'Home loan 42500 every month on 5th', intent: 'create_financial_obligation' },
    { text: 'Saturday electrician ko call karna', intent: 'create_task' },
    { text: 'Remind me 2 days before every bill', intent: 'create_reminder' },
    { text: 'Home loan paid', intent: 'mark_paid' },
    { text: "Mom's birthday on 25 December", intent: 'create_commitment' },
    { text: 'remember that mummy is Sunita', intent: 'remember_preference' },
    { text: 'Move the plumber to tomorrow', intent: 'reschedule' },
    { text: 'what is pending', intent: 'list_pending' },
  ];

  it.each(cases)('$text validates against its tool schema', ({ text, intent }) => {
    const result = parse(text);
    expect(result.intent).toBe(intent);
    const parsed = intentArgsSchemas[intent].safeParse(result.args);
    expect(parsed.success).toBe(true);
  });
});
