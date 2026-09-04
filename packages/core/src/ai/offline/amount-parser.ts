/**
 * Deterministic money extraction for the offline (no-AI-key) mode.
 *
 * Returns a plain number for the intent schema, which validates it and hands it to the
 * finance service — where it becomes exact minor units before any arithmetic happens
 * (.claude/rules/finance-rules.md: never floating point arithmetic on money). Nothing is
 * summed or compared here; this only reads a figure out of a sentence.
 */

export interface ParsedAmount {
  amount: number;
  currency: string;
  matchedText: string;
}

/**
 * Indian users write large sums as "42.5k", "1.5 lakh", "2 crore" as often as in full.
 * Each multiplier is exact in binary except through the decimal, so the result is
 * rounded to whole rupees rather than left with a floating-point tail.
 */
const MULTIPLIERS: { pattern: string; factor: number }[] = [
  { pattern: 'k|thousand|hazaar|hazar', factor: 1_000 },
  { pattern: 'l|lac|lakh|lakhs', factor: 100_000 },
  { pattern: 'cr|crore|crores', factor: 10_000_000 },
];

const CURRENCY_MARKERS: { pattern: RegExp; currency: string }[] = [
  { pattern: /₹|\brs\.?\b|\binr\b|\brupees?\b|\brupaye\b/i, currency: 'INR' },
  { pattern: /\$|\busd\b|\bdollars?\b/i, currency: 'USD' },
  { pattern: /€|\beur\b|\beuros?\b/i, currency: 'EUR' },
  { pattern: /£|\bgbp\b|\bpounds?\b/i, currency: 'GBP' },
];

/**
 * Every currency marker, as a regex alternation used to spot a figure that is explicitly
 * money. It has to cover all of them, not just the rupee ones: a marked "$40" is as
 * clearly an amount as "₹40", and treating only INR as marked meant small foreign
 * amounts fell through to the three-digit-minimum rule and were missed entirely.
 */
const SYMBOL_PREFIX = String.raw`₹|\$|€|£|rs\.?\s*|inr\s*|usd\s*|eur\s*|gbp\s*`;

function detectCurrency(text: string): string {
  for (const { pattern, currency } of CURRENCY_MARKERS) {
    if (pattern.test(text)) return currency;
  }
  return 'INR';
}

/**
 * Finds the monetary figure in a sentence.
 *
 * A number that is clearly something else is skipped: a day-of-month ("on the 5th"), a
 * lead time ("2 days before"), a date. Reading "5" out of "on the 5th" as ₹5 would be a
 * confident, plausible, wrong write — exactly the failure this parser has to avoid.
 */
export function parseAmount(text: string, defaultCurrency = 'INR'): ParsedAmount | null {
  const currency = CURRENCY_MARKERS.some(({ pattern }) => pattern.test(text))
    ? detectCurrency(text)
    : defaultCurrency;

  // Blank out spans that look like a figure but are not money, so the scan below cannot
  // pick a number out of them.
  const masked = text
    .replace(/\b(?:on\s+(?:the\s+)?)?\d{1,2}(?:st|nd|rd|th)\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:tarikh|tareekh)\b/gi, ' ')
    .replace(/\b\d{1,3}\s*(?:days?|din)\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[:/]\d{2}\b/g, ' ');

  const multiplierAlternatives = MULTIPLIERS.map((m) => m.pattern).join('|');
  const withMultiplier = masked.match(
    new RegExp(String.raw`(?:${SYMBOL_PREFIX})?\s*(\d[\d,]*(?:\.\d+)?)\s*(${multiplierAlternatives})\b`, 'i'),
  );

  if (withMultiplier) {
    const base = Number(withMultiplier[1]!.replace(/,/g, ''));
    const suffix = withMultiplier[2]!.toLowerCase();
    const factor = MULTIPLIERS.find((m) => new RegExp(`^(?:${m.pattern})$`, 'i').test(suffix))?.factor ?? 1;
    if (Number.isFinite(base)) {
      return { amount: Math.round(base * factor), currency, matchedText: withMultiplier[0] };
    }
  }

  // A plain figure. Three digits minimum unless a currency marker is attached — a bare
  // "5" in "call Ravi at 5" is not an amount, but "rs 50" is.
  const explicit = masked.match(new RegExp(String.raw`(?:${SYMBOL_PREFIX})\s*(\d[\d,]*(?:\.\d{1,2})?)`, 'i'));
  if (explicit) {
    const value = Number(explicit[1]!.replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) {
      return { amount: value, currency, matchedText: explicit[0].trim() };
    }
  }

  const bare = masked.match(/\b(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?)\b/);
  if (bare) {
    const value = Number(bare[1]!.replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) {
      return { amount: value, currency, matchedText: bare[0] };
    }
  }

  return null;
}
