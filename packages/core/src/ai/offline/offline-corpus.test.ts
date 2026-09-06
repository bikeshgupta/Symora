/**
 * The offline half of the NLP regression corpus.
 *
 * `orchestrator/nlp-corpus.test.ts` asserts only the deterministic halves — language,
 * ambiguity, the risk gate — because it cannot know which intent a model will pick. The
 * rule parser has no such excuse: it is deterministic code, it is what a pilot user
 * without an AI key actually talks to, and the Phase 2 and Phase 7 acceptance phrases
 * are exactly what it has to get right. So they are asserted here, end to end, with no
 * provider and no network.
 *
 * Add a row whenever a real phrase parses wrong in use.
 */

import { describe, expect, it } from 'vitest';
import { extractIntentOffline } from './rule-parser';
import { detectLanguage } from '../orchestrator/language';
import { buildTemporalAnchors } from '../../domain/temporal/temporal-context';
import type { IntentName } from '../../types/intents';

// Saturday 2026-09-05, 09:00 in Kolkata — fixed so every date assertion is reproducible.
const temporal = buildTemporalAnchors(new Date('2026-09-05T09:00:00+05:30'), 'Asia/Kolkata');

function parse(text: string) {
  return extractIntentOffline(text, detectLanguage(text), { temporal });
}

interface Row {
  text: string;
  intent: IntentName;
  /** Args that must be present and exact. Others are allowed alongside. */
  args?: Record<string, unknown>;
  note?: string;
}

const CORPUS: Row[] = [
  // -- Phase 2 acceptance examples --
  {
    text: 'Home loan 42500 every month on 5th.',
    intent: 'create_financial_obligation',
    args: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, dueDay: 5, recurrenceRule: 'monthly' },
    note: 'the recurrence and due day must not survive into the account name',
  },
  {
    text: 'Saturday electrician ko call karna.',
    intent: 'create_task',
    args: { title: 'electrician call', dueDate: '2026-09-12' },
    note: 'the weekday became the due date, so it is not also the title',
  },
  {
    text: 'Remind me 2 days before every bill.',
    intent: 'create_reminder',
    args: { title: 'bill', leadDays: 2 },
  },
  { text: 'This month what all is pending?', intent: 'list_pending', args: { type: 'ALL' } },
  {
    text: 'Home loan kal pay kar diya.',
    intent: 'mark_paid',
    args: { accountName: 'Home loan', paidDate: '2026-09-04' },
    note: 'past tense settles "kal" as yesterday',
  },

  // -- Phase 7: Hindi / Hinglish --
  {
    text: 'Kal doctor appointment hai',
    intent: 'create_task',
    args: { title: 'doctor appointment', dueDate: '2026-09-06' },
    note: 'no past tense, so "kal" reads forward; the copula is not part of the title',
  },
  {
    text: 'Mummy ka birthday 12 October ko hai.',
    intent: 'create_commitment',
    args: { type: 'IMPORTANT_DATE', title: 'Mummy ka birthday', dueDate: '2026-10-12', recurrenceRule: 'yearly' },
  },
  {
    text: 'Rent 15000 har mahine 1 tarikh ko',
    intent: 'create_financial_obligation',
    args: { accountName: 'Rent', obligationType: 'rent', amount: 15000, dueDay: 1 },
  },

  // -- Phase 5: drafting --
  {
    text: 'Draft a message to the landlord about the leak',
    intent: 'draft_message',
    args: { recipientRelationship: 'landlord' },
    note: 'what the message is about is not part of who it is to',
  },
  {
    text: 'write a message to my mummy about coming home late',
    intent: 'draft_message',
    args: { recipientRelationship: 'mummy' },
  },

  // -- Conversational phrasings of a recurring payment. The account name is anchored on
  //    the obligation keyword, not left over from subtracting structure out of the
  //    sentence, so framing and trailing clauses do not become the name. --
  {
    text: 'i have a home loan emi running which deduct 5th of every month, and the amount is 75000',
    intent: 'create_financial_obligation',
    args: { accountName: 'Home loan', obligationType: 'emi', amount: 75000, dueDay: 5 },
    note: 'reported from use: the whole sentence was becoming the account name',
  },
  {
    text: 'my car loan is 18000 every month on the 12th',
    intent: 'create_financial_obligation',
    args: { accountName: 'Car loan', amount: 18000, dueDay: 12 },
    note: '"my" is framing, not part of the name',
  },
  {
    text: 'HDFC home loan 42500 every month on 5th',
    intent: 'create_financial_obligation',
    args: { accountName: 'HDFC home loan', amount: 42500, dueDay: 5 },
    note: 'a real qualifier IS kept — two home loans must not collide',
  },
  {
    text: 'LIC premium 12000 every month on 15th',
    intent: 'create_financial_obligation',
    args: { accountName: 'LIC premium', obligationType: 'insurance', amount: 12000, dueDay: 15 },
  },
  {
    text: 'Society maintenance 3000 every month on 10th',
    intent: 'create_financial_obligation',
    args: { accountName: 'Society maintenance', obligationType: 'other', amount: 3000, dueDay: 10 },
    note: 'no keyword to anchor on, but what is left still reads as a name',
  },

  // -- Other V1 intents --
  {
    text: 'Netflix 649 every month on the 20th',
    intent: 'create_financial_obligation',
    args: { accountName: 'Netflix', obligationType: 'subscription', amount: 649, dueDay: 20 },
  },
  {
    text: 'remember that mummy is Sunita',
    intent: 'remember_preference',
    args: { key: 'mummy', value: 'Sunita' },
  },
  { text: 'how much do I need to pay this month?', intent: 'calculate_monthly_requirement' },

  // -- Phase 9: more of the messy Hinglish people actually type. Every row here was
  //    run against the parser first; none of them is aspirational. --
  {
    text: 'maine rent de diya 15000',
    intent: 'mark_paid',
    args: { accountName: 'rent', amount: 15000 },
    note: 'reported from use: the first-person "maine" was ending up in the account name',
  },
  {
    text: 'bijli ka bill kal bhar diya',
    intent: 'mark_paid',
    args: { accountName: 'bijli ka bill', paidDate: '2026-09-04' },
    note: 'past tense settles "kal" backwards without asking',
  },
  {
    text: 'gas cylinder book karna hai parso',
    intent: 'create_task',
    args: { title: 'gas cylinder book', dueDate: '2026-09-07' },
    note: '"parso" is two days out, and "karna hai" is framing rather than title',
  },
  {
    text: 'car service ka reminder 2 din pehle',
    intent: 'create_reminder',
    args: { leadDays: 2 },
    note: '"2 din pehle" is a lead time, not a due date',
  },
  { text: 'kitna pending hai', intent: 'list_pending', args: { type: 'ALL' } },
  { text: 'इस महीने क्या क्या pending hai?', intent: 'list_pending', args: { type: 'ALL' } },
  {
    text: 'paisa kitna dena hai is mahine',
    intent: 'calculate_monthly_requirement',
    note: 'asks for a total without using the word "total" or "how much to pay"',
  },
  {
    text: 'phone recharge 299 every month on 22',
    intent: 'create_financial_obligation',
    args: { accountName: 'Phone', obligationType: 'bill', amount: 299, dueDay: 22 },
  },
  {
    text: 'Netflix band kar dena hai',
    intent: 'create_task',
    args: { title: 'Netflix band kar dena' },
    note: 'a subscription keyword must not turn cancelling it into a recurring payment',
  },
];

describe('offline rule parser — acceptance corpus', () => {
  it.each(CORPUS)('$text', ({ text, intent, args }) => {
    const result = parse(text);
    expect(result.intent).toBe(intent);
    if (args) expect(result.args).toMatchObject(args);
  });

  it('asks for a name rather than inventing one it would then show on a card', () => {
    // No obligation keyword and nothing name-like left over. A confirmation card showing
    // a name Symora made up invites the user to skim past it and save it that way.
    const result = parse('i pay 2500 every month on the 8th for something');
    expect(result.intent).toBeNull();
    expect(result.text).toContain('what should I call this payment?');
    expect(result.text).toContain('8th');
  });

  it('never invents an intent for something it does not understand', () => {
    const result = parse('what do you think about the weather lately');
    expect(result.intent).toBeNull();
    expect(result.text).toBeTruthy();
  });

  it('reports zero token usage, since nothing was billed', () => {
    expect(parse('Home loan 42500 every month on 5th.').usage.totalTokens).toBe(0);
  });
});

/**
 * Devanagari is a known limit of this parser, not a bug to be found later.
 *
 * The patterns are Latin-script, so Hindi typed in Devanagari cannot match any of them.
 * That is a Phase 7 gap recorded in PROGRESS.md, and the model path handles it. What
 * matters offline is that the limit is stated honestly instead of being reported back to
 * the user as their phrasing being unclear — they would rewrite the sentence forever.
 */
describe('offline rule parser — Devanagari input', () => {
  const DEVANAGARI_PHRASES = [
    'होम लोन 42500 हर महीने 5 तारीख को',
    'मम्मी को कल फोन करना है',
    'बिजली का बिल 2400 हर महीने 18 तारीख को',
  ];

  it.each(DEVANAGARI_PHRASES)('never guesses an intent from %s', (text) => {
    const result = parse(text);
    // The one outcome that would be worse than not understanding: understanding wrongly.
    expect(result.intent).toBeNull();
  });

  it.each(DEVANAGARI_PHRASES)('answers %s in Hindi, not in English', (text) => {
    const result = parse(text);
    expect(result.text).toMatch(/[\u0900-\u097F]/);
    expect(result.text).not.toMatch(/I didn't catch an action/);
  });

  it('says the limit is the parser’s script, not the user’s phrasing', () => {
    const result = parse('होम लोन 42500 हर महीने 5 तारीख को');
    expect(result.text).toContain('रोमन');
    // And points at a phrasing that actually works.
    expect(result.text).toContain('har mahine');
  });

  it('answers Hinglish in Hinglish rather than English', () => {
    const result = parse('kuch samajh nahi aaya mujhe');
    expect(result.intent).toBeNull();
    expect(result.text).toContain('har mahine');
    expect(result.text).not.toMatch(/I didn't catch an action/);
  });

  it('still answers plain English in English', () => {
    const result = parse('what do you think about the weather lately');
    expect(result.text).toMatch(/I didn't catch an action/);
  });
});
