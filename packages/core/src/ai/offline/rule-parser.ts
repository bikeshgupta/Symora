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
import { parseDate, parseDueDay, parseLeadDays, stripDueDay, stripLeadDays } from './date-parser';
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

/**
 * Removes one phrase the parsers already consumed, wherever and however it is cased.
 *
 * Case matters here because the parsers return canonical text, not the user's: "kal" for
 * a Hinglish relative date, "tomorrow" for an English one. A plain `String.replace` with
 * that canonical form is both case-sensitive and first-match-only, so "Kal doctor
 * appointment hai" kept its "Kal" and the task was titled with the date still in it.
 */
function stripPhrase(text: string, phrase: string): string {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'gi'), ' ');
}

/** Strips the phrases that carried structure so what is left can serve as a title. */
function cleanTitle(text: string, removals: (string | undefined)[]): string {
  let cleaned = text;
  for (const removal of removals) {
    if (removal) cleaned = stripPhrase(cleaned, removal);
  }
  return cleaned
    .replace(
      // "karna hai" and "remind me" sit before their own first words on purpose:
      // alternation takes the first branch that matches, and stripping "remind" alone
      // would strand the "me" in the title.
      /\b(remind me|remind|please|kindly|yaad dila dena|yaad dilana|yaad rakhna|karna hai|karna|mujhe|ko|par|on|at|every|har|hai|hain)\b/gi,
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

/**
 * Words that can precede the obligation keyword without being part of its name.
 *
 * Only the qualifier immediately to the left is ever considered (see `accountNameFrom`),
 * so this needs to cover the framing a sentence puts there — "a", "my", "mera" — not
 * every function word in the language.
 */
const NOT_A_QUALIFIER =
  /^(?:i|we|you|a|an|the|my|our|your|is|are|was|have|has|had|there|this|that|these|those|and|but|which|who|of|for|on|in|at|to|per|every|each|month|monthly|running|ongoing|new|paying|pay|pays|paid|deduct|deducts|deducted|amount|rs|inr|rupees|mera|meri|mere|apna|apni|ek|hai|hain|ka|ki|ke|ko|har|mahine|wala|wali)$/i;

/** Sentence-like rather than name-like: past this, subtraction has kept the whole input. */
const MAX_NAME_WORDS = 5;

/** "5th", "1st", "22nd" — for asking about a day the user already gave us. */
function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th';
}

/**
 * The account name for a recurring payment.
 *
 * Built by *anchoring* on the obligation keyword rather than by subtracting known
 * structure from the sentence. Subtraction is fine for a terse "Home loan 42500 every
 * month on 5th", but it keeps everything it does not recognise — so "i have a home loan
 * emi running which deduct 5th of every month, and the amount is 75000" produced an
 * account named "i have a home loan emi running which deduct of and the amount is". The
 * user then sees that on a confirmation card, which is worse than being asked.
 *
 * So: find the keyword that decided the type, keep one qualifier to its left when there
 * is a real one ("HDFC home loan", not "a home loan"), and fall back to the subtractive
 * clean only when no keyword matched at all.
 */
function accountNameFrom(raw: string, fallback: string): string | null {
  const anchor = OBLIGATION_TYPES.map(({ pattern }) => raw.match(pattern)).find(
    (match): match is RegExpMatchArray => match !== null && match.index !== undefined,
  );

  if (anchor) {
    const preceding = raw
      .slice(0, anchor.index)
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0);
    const qualifier = preceding[preceding.length - 1] ?? '';
    // A number is structure, not a name — "75000 home loan" is not called "75000 home".
    const keepQualifier = qualifier.length > 0 && !NOT_A_QUALIFIER.test(qualifier) && !/\d/.test(qualifier);
    const name = `${keepQualifier ? `${qualifier} ` : ''}${anchor[0]}`.replace(/\s+/g, ' ').trim();
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // No keyword to anchor on. The subtractive clean is all there is, and it is only
  // trustworthy while what it left behind still reads as a name: short, and not opening
  // on a function word. "Society maintenance" passes; "i pay for something" does not,
  // and is a question worth asking rather than a name worth saving.
  if (!fallback) return null;
  const words = fallback.split(/\s+/);
  if (words.length > MAX_NAME_WORDS) return null;
  return NOT_A_QUALIFIER.test(words[0]!) ? null : fallback;
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

/**
 * Who the message is for, from a "to ..." phrase.
 *
 * The relationship is the first word or two after "to"; everything from the first
 * connector onward describes the message, not the recipient. Without that cut, "draft a
 * message to the landlord about the leak" addressed itself to "landlord about the leak",
 * which then reached the template drafter as a name.
 */
function recipientFrom(text: string): string | undefined {
  // \p{L}\p{M} rather than an explicit Devanagari range: matras are combining marks,
  // and mixing them with base letters in a character class is both misleading and
  // wrong for scripts that stack them.
  const to = text.match(/\bto\s+(?:my\s+|the\s+)?([\p{L}\p{M}\s]{2,30})/iu);
  if (!to) return undefined;
  const beforeConnector = to[1]!.split(/\b(?:about|regarding|saying|asking|that|for|re)\b/i)[0]!;
  const relationship = beforeConnector.trim().split(/\s+/).slice(0, 2).join(' ');
  return relationship || undefined;
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
    return result(
      'draft_message',
      { context: about || raw, recipientRelationship: recipientFrom(raw) },
      about ? CONFIDENCE_LIKELY : CONFIDENCE_UNSURE,
    );
  }

  // -- create_financial_obligation: an amount plus a recurrence --
  if (amount && RECURRING.test(raw)) {
    const dueDay = parseDueDay(raw);
    // Order matters: the recurrence and the due day come out as whole phrases first,
    // because cleanTitle's own stopword pass eats the 'every' and 'on' that hold them
    // together and leaves 'month 5th' stranded in the account name.
    const subtractive = cleanTitle(stripDueDay(raw.replace(RECURRING, ' ')), [amount.matchedText]);
    const accountName = accountNameFrom(raw, subtractive);

    if (!dueDay) {
      return conversational(
        `I can set up "${accountName ?? 'that'}" for ${amount.currency} ${amount.amount} a month — which day of the month is it due?`,
      );
    }
    // Asking beats guessing: this always reaches a confirmation card, and a card showing
    // a name Symora invented invites the user to skim past it and save it that way.
    if (!accountName) {
      return conversational(
        `I have ${amount.currency} ${amount.amount} on the ${dueDay}${ordinalSuffix(dueDay)} of every month — what should I call this payment?`,
      );
    }
    return result(
      'create_financial_obligation',
      {
        accountName,
        obligationType: detectObligationType(raw),
        amount: amount.amount,
        currency: amount.currency,
        dueDay,
        recurrenceRule: 'monthly',
      },
      CONFIDENCE_CLEAR,
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
    // REMIND is not pre-stripped here the way RECURRING is above: it would take the
    // "remind" out of "remind me" and leave a title starting with a stranded "me".
    // cleanTitle's own list handles the whole phrase.
    const title = cleanTitle(stripLeadDays(raw), [date?.matchedText]);
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
