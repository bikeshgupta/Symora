/**
 * MessagingAdapter implementation for WhatsApp (PROGRESS.md Phase 5: "One-tap WhatsApp
 * — wa.me link with prefilled text (no WhatsApp Business API in V1)").
 *
 * This builds a link and nothing else. Symora never sends a message on the user's
 * behalf in V1 — the user opens the link, reads what was drafted, and presses send
 * themselves. Automatic sending is future scope, and keeping this a pure function is
 * what stops it drifting into a send path by accident.
 */

import type {
  MessageHandoffLink,
  MessageHandoffRequest,
  MessagingAdapter,
} from './messaging-adapter';

/**
 * wa.me wants digits only — no '+', spaces, or dashes.
 *
 * A bare 10-digit number is assumed to be Indian and gets the 91 country code, matching
 * the product's primary market; anything already carrying a country code is left alone.
 * A number that cannot be made sense of returns null, and the caller falls back to a
 * link with no recipient rather than guessing wrong and opening a chat with a stranger.
 */
export function normalizePhone(raw: string | undefined, defaultCountryCode = '91'): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Indian numbers are 10 digits; with a country code they are 11-15 (E.164's ceiling).
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function buildWhatsAppLink(request: MessageHandoffRequest): MessageHandoffLink {
  const phone = normalizePhone(request.recipientPhone);
  const text = encodeURIComponent(request.text);

  // https://wa.me/<phone>?text=... opens a specific chat; without a number, WhatsApp
  // asks the user to pick the recipient, which is the right fallback for a draft whose
  // recipient Symora does not know.
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;

  return { url, channel: 'whatsapp' };
}

export const whatsAppAdapter: MessagingAdapter = {
  name: 'wa.me',
  channel: 'whatsapp',
  buildHandoffLink: buildWhatsAppLink,
};
