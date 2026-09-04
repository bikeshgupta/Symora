/**
 * Rule-based intent extraction for the offline (no-AI-key) mode.
 *
 * This produces the same `ExtractionResult` the model path produces, so everything
 * downstream — the confidence gate, the confirmation gate, the typed tool registry, the
 * domain services — is byte-for-byte the same code. Swapping in an API key later changes
 * which extractor runs and nothing else.
 *
 * It is a pattern matcher, not a language model, and the honest confidence it reports is
 * what makes that safe: a clear match scores high and proceeds; a partial one scores
 * below the threshold and the pipeline asks a clarifying question instead of writing.
 * Guessing is the one thing it must not do.
 *
 * Coverage is the phrasings people actually type for the twelve V1 intents, in English
 * and Hinglish. Anything it does not recognise falls through to a conversational reply
 * that tells the user what it can do — never to a wrong write.
 */

import type { ExtractionResult } from '../orchestrator/intent-extraction';
import type { IntentName } from '../../types/intents';
import type { MessageLanguage } from '../../types/conversation';
import type { TemporalAnchors } from '../../domain/temporal/temporal-context';
import { parseDate, parseDueDay, parseLeadDays } from './date-parser';
import { parseAmount } from './amount-parser';

/** Reported when a pattern matched cleanly and every required field was found. */
const CONFIDENCE_CLEAR = 0.9;
/** Enough to act on, but the pipeline's own gates still apply. */
const CONFIDENCE_LIKELY = 0.75;
/** Below CONFIDENCE_THRESHOLD (0.6) on purpose: the pipeline will ask rather than write. */
const CONFIDENCE_UNSURE = 0.4;

const NO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
const MODEL = 'offline-rules';

function result(
  intent: IntentName,
  args: Record<string, unknown>,
  confidence: number,
): ExtractionResult {
  return { intent, args: { ...args, confidence }, confidence, text: null, usage: NO_USAGE, model: MODEL };
}

function conversational(text: string): ExtractionResult {
  return { intent: null, args: null, confidence: 0, text, usage: NO_USAGE, model: MODEL };
}

/** Strips the phrases that carried structure so what is left can serve as a title. */
function cleanTitle(text: string, removals: (string | undefined)[]): string {
  let cleaned = text;
  for (const removal of removals) {
    if (removal) cleaned = cleaned.replace(removal, ' ');
  }
  return cleaned
    .replace(
      /\b(remind me|remind|please|kindly|yaad dila dena|yaad dilana|yaad rakhna|karna hai|karna|mujhe|ko|par|on|at|every|har)\b/gi,
      ' ',
    )
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const OBLIGATION_TYPES: { pattern: RegExp; type: string }[] = [
  { pattern: /\b(emi|loan|home\s*loan|car\s*loan|mortgage|kist)\b/i, type: 'emi' },
  { pattern: /\b(rent|kiraya|kiraaya)\b/i, type: 'rent' },
  { pattern: /\b(insurance|policy|premium|bima)\b/i, type: 'insurance' },
  {
    pattern: /\b(netflix|prime|spotify|hotstar|youtube|subscription|membership|plan)\b/i,
    type: 'subscription',
  },
  { pattern: /\b(bill|electricity|water|gas|broadband|internet|mobile|recharge|phone)\b/i, type: 'bill' },
];

function detectObligationType(text: string): string {
  return OBLIGATION_TYPES.find(({ pattern }) => pattern.test(text))?.type ?? 'other';
}

const RECURRING = /\b(every\s+month|monthly|har\s+mahine|har\s+month|per\s+month|each\s+month|mahine)\b/i;
const PAID = /\b(paid|pay\s+kar\s+diya|pay\s+kiya|bhar\s+diya|bhara|bhar\s+diya\s+hai|de\s+diya|cleared|settled|kar\s+diya)\b/i;
const DONE = /\b(done|finished|completed|complete|ho\s+gaya|ho\s+gayi|kar\s+liya)\b/i;
const REMIND = /\b(remind|reminder|yaad\s+dila|yaad\s+dilana|yaad\s+dila\s+dena|yaad\s+rakhna)\b/i;
const LIST_PENDING = /\b(pending|baki|bakaya|what.s\s+left|outstanding|due\s+list|kya\s+baki)\b/i;
const MONTHLY_TOTAL =
  /\b(how\s+much|kitna|kitne|total|monthly\s+requirement|this\s+month.*(?:need|pay|due)|mahine\s+me\s+kitna)\b/i;
const REMEMBER = /\b(remember|note\s+that|yaad\s+rakhna|yaad\s+rakho|save\s+that)\b/i;
const DRAFT = /\b(draft|write\s+a?\s*message|message\s+likh|likh\s+do|compose)\b/i;
const RESCHEDULE = /\b(move|postpone|reschedule|shift|push|aage\s+karo|badal\s+do)\b/i;
const IMPORTANT_DATE = /\b(birthday|anniversary|janamdin|salgirah|renewal|expires?|expiry)\b/i;

/**
 * A pasted third-party message rather than something the user is saying themselves.
 * Length plus a transactional marker, because a short "paid the rent" is the user
 * telling Symora something, while a long block quoting a bank is not.
 */
const PASTE_MARKERS =
  /\b(debited|credited|txn|transaction\s+id|ref\s*no|upi|neft|imps|a\/c|account\s+ending|pnr|booking\s+id|order\s+id|policy\s+no|do\s+not\s+share|otp)\b/i;

function looksPasted(text: string): boolean {
  return text.length > 120 && PASTE_MARKERS.test(text);
}

export interface OfflineExtractionOptions {
  temporal: TemporalAnchors;
  /** Set when the caller already knows this is pasted content. */
  forcePaste?: boolean;
}

export function extractIntentOffline(
  text: string,
  _language: MessageLanguage,
  options: OfflineExtractionOptions,
): ExtractionResult {
  const raw = text.trim();
  const { temporal } = options;

  if (options.forcePaste || looksPasted(raw)) {
    return result('interpret_pasted_message', { pastedText: raw }, CONFIDENCE_CLEAR);
  }

  const date = parseDate(raw, temporal);
  const amount = parseAmount(raw);

  // -- Reads first: they write nothing, so a false positive is cheap. --
  if (MONTHLY_TOTAL.test(raw) && /\b(pay|payment|due|baki|emi|bill|month|mahine)\b/i.test(raw)) {
    return result('calculate_monthly_requirement', {}, CONFIDENCE_LIKELY);
  }
  if (LIST_PENDING.test(raw)) {
    return result('list_pending', { type: 'ALL' }, CONFIDENCE_LIKELY);
  }

  // -- remember_preference: "remember that X is Y" --
  if (REMEMBER.test(raw)) {
    const pair = raw.match(/\b(?:remember|note)\s+(?:that\s+)?(.+?)\s+(?:is|=|means)\s+(.+)$/i);
    if (pair) {
      return result(
        'remember_preference',
        { key: pair[1]!.trim(), value: pair[2]!.trim().replace(/[.!]$/, ''), memoryType: 'fact' },
        CONFIDENCE_CLEAR,
      );
    }
    return conversational(
      'Tell me what to remember as "X is Y" — for example, "remember that mummy is Sunita".',
    );
  }

  // -- draft_message --
  if (DRAFT.test(raw)) {
    const about = raw.replace(DRAFT, ' ').replace(/^\s*(a|an|the)\s+/i, '').trim();
    // \p{L}\p{M} rather than an explicit Devanagari range: matras are combining marks,
    // and mixing them with base letters in a character class is both misleading and
    // wrong for scripts that stack them.
    const to = raw.match(/\bto\s+(?:my\s+|the\s+)?([\p{L}\p{M}\s]{2,30})/iu);
    return result(
      'draft_message',
      { context: about || raw, recipientRelationship: to?.[1]?.trim() },
      about ? CONFIDENCE_LIKELY : CONFIDENCE_UNSURE,
    );
  }

  // -- create_financial_obligation: an amount plus a recurrence --
  if (amount && RECURRING.test(raw)) {
    const dueDay = parseDueDay(raw);
    const accountName = cleanTitle(raw, [amount.matchedText]).replace(RECURRING, ' ').replace(/\s+/g, ' ').trim();

    if (!dueDay) {
      return conversational(
        `I can set up "${accountName || 'that'}" for ${amount.currency} ${amount.amount} a month — which day of the month is it due?`,
      );
    }
    return result(
      'create_financial_obligation',
      {
        accountName: accountName || 'Payment',
        obligationType: detectObligationType(raw),
        amount: amount.amount,
        currency: amount.currency,
        dueDay,
        recurrenceRule: 'monthly',
      },
      accountName ? CONFIDENCE_CLEAR : CONFIDENCE_UNSURE,
    );
  }

  // -- mark_paid --
  if (PAID.test(raw)) {
    const accountName = cleanTitle(raw, [amount?.matchedText, date?.matchedText])
      .replace(PAID, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!accountName) {
      return conversational('Which payment did you make?');
    }
    return result(
      'mark_paid',
      { accountName, amount: amount?.amount, paidDate: date?.date },
      date?.wasAmbiguous ? CONFIDENCE_UNSURE : CONFIDENCE_CLEAR,
    );
  }

  // -- reschedule --
  if (RESCHEDULE.test(raw) && date) {
    const title = cleanTitle(raw, [date.matchedText]).replace(RESCHEDULE, ' ').replace(/\s+/g, ' ').trim();
    if (title) {
      return result('reschedule', { title, newDueDate: date.date }, CONFIDENCE_LIKELY);
    }
  }

  // -- mark_done. Checked after mark_paid because "kar diya" appears in both. --
  if (DONE.test(raw)) {
    const title = cleanTitle(raw, [date?.matchedText]).replace(DONE, ' ').replace(/\s+/g, ' ').trim();
    if (title) return result('mark_done', { title }, CONFIDENCE_LIKELY);
  }

  // -- create_commitment: birthdays, anniversaries, renewals --
  if (IMPORTANT_DATE.test(raw) && date) {
    return result(
      'create_commitment',
      {
        type: 'IMPORTANT_DATE',
        title: cleanTitle(raw, [date.matchedText]) || 'Important date',
        dueDate: date.date,
        recurrenceRule: /\b(renewal|expires?|expiry)\b/i.test(raw) ? undefined : 'yearly',
      },
      CONFIDENCE_LIKELY,
    );
  }

  // -- create_reminder --
  if (REMIND.test(raw)) {
    const leadDays = parseLeadDays(raw);
    const title = cleanTitle(raw, [date?.matchedText]).replace(REMIND, ' ').replace(/\s+/g, ' ').trim();
    if (!title) return conversational('What should I remind you about?');
    return result(
      'create_reminder',
      {
        title,
        dueDate: date?.date,
        leadDays: leadDays ?? undefined,
        recurrenceRule: RECURRING.test(raw) ? 'monthly' : undefined,
      },
      date || leadDays ? CONFIDENCE_CLEAR : CONFIDENCE_LIKELY,
    );
  }

  // -- create_task: a dated action with no money and no reminder framing --
  if (date && !amount) {
    const title = cleanTitle(raw, [date.matchedText]);
    if (title) {
      return result(
        'create_task',
        { title, dueDate: date.date },
        date.wasAmbiguous ? CONFIDENCE_UNSURE : CONFIDENCE_CLEAR,
      );
    }
  }

  // -- A bare action with no date at all still makes a usable task. --
  const ACTION = /\b(call|book|buy|pay|send|submit|collect|pick\s*up|visit|check|fix|repair|karna|karo|lena|dena|bhejna)\b/i;
  if (ACTION.test(raw) && raw.length < 120) {
    const title = cleanTitle(raw, []);
    if (title) return result('create_task', { title }, CONFIDENCE_LIKELY);
  }

  return conversational(
    "I didn't catch an action in that. Try something like \"Home loan 42500 every month on 5th\", " +
      '"remind me to call the electrician on Saturday", or "what\'s pending?".',
  );
}
