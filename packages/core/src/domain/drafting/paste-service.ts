/**
 * Paste-to-Symora (PROGRESS.md Phase 5). The user pastes something someone else wrote —
 * a payment confirmation, an appointment, a booking, a renewal notice — and Symora
 * interprets it and proposes an action.
 *
 * Two rules govern this path, both from .claude/rules:
 *
 * 1. Pasted third-party content is ALWAYS a high-impact write
 *    (ai-pipeline.md § Confidence and confirmation). Whatever action the text implies is
 *    proposed for confirmation and never executed straight away, regardless of how
 *    confident the extraction was.
 * 2. Pasted text is data, not instruction (auth-security.md § Input and output safety).
 *    It may well contain something shaped like a command; that must not change what the
 *    model is allowed to do. The typed tool registry is the actual boundary.
 */

export type PasteCategory =
  | 'payment_confirmation'
  | 'appointment'
  | 'booking_confirmation'
  | 'renewal_notice'
  | 'other';

export const PASTE_CATEGORIES: PasteCategory[] = [
  'payment_confirmation',
  'appointment',
  'booking_confirmation',
  'renewal_notice',
  'other',
];

/**
 * A cheap, deterministic first pass over pasted text, used to label what the user is
 * looking at and to pick the memory types worth retrieving before extraction.
 *
 * It deliberately does not decide the action — that is the extraction model's job via
 * interpret_pasted_message. This only categorises, so a wrong guess costs a label, not
 * a wrong write.
 */
const CATEGORY_PATTERNS: { category: PasteCategory; pattern: RegExp }[] = [
  {
    category: 'payment_confirmation',
    pattern:
      /\b(debited|credited|paid|payment\s+(of|received|successful)|txn|transaction|upi|neft|imps|rs\.?\s*\d|inr\s*\d|₹)/i,
  },
  {
    category: 'renewal_notice',
    pattern: /\b(renew(al|ed|s)?|expir(y|es|ing|ed)|due\s+for\s+renewal|policy\s+no|premium)\b/i,
  },
  {
    category: 'booking_confirmation',
    pattern: /\b(booking|booked|reservation|reserved|pnr|order\s+id|confirmation\s+(no|number|code)|ticket)\b/i,
  },
  {
    // Deliberately narrow. A bare "meeting" or "visit" also matches ordinary chatter
    // ("what time are we meeting?"), which is not a pasted appointment confirmation —
    // so the pattern requires an actual scheduling phrase.
    category: 'appointment',
    pattern: /\b(appointment|consultation)\b|\bscheduled\s+(for|on|at)\b|\btime\s+slot\b/i,
  },
];

export function categorizePastedText(text: string): PasteCategory {
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return 'other';
}

const CATEGORY_LABEL: Record<PasteCategory, string> = {
  payment_confirmation: 'a payment confirmation',
  appointment: 'an appointment',
  booking_confirmation: 'a booking confirmation',
  renewal_notice: 'a renewal notice',
  other: 'a message',
};

export function describeCategory(category: PasteCategory): string {
  return CATEGORY_LABEL[category];
}

/**
 * Pasted content can be long — a whole email thread — and only the top of it carries the
 * useful signal. Truncating bounds the token cost and, incidentally, the blast radius of
 * anything adversarial buried further down.
 */
export const MAX_PASTE_CHARS = 4000;

export function truncateForExtraction(text: string, limit = MAX_PASTE_CHARS): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
