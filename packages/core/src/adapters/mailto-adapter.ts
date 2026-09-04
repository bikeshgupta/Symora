/**
 * EmailAdapter implementation using a mailto: prefill (PROGRESS.md Phase 5: "One-tap
 * email — mailto prefill in V1").
 *
 * Like the WhatsApp adapter, this only builds a link. Symora does not send email; full
 * Gmail integration is future scope.
 */

import type { EmailAdapter, EmailDraft, EmailHandoffLink } from './email-adapter';

/**
 * mailto has two different escaping rules in one URL, and mixing them up is the usual
 * bug: the address list before the '?' must not be percent-encoded as a whole (the
 * commas separate addresses), while every query value after it must be.
 *
 * encodeURIComponent leaves !'()* alone, which are legal in a mailto address but change
 * meaning inside a query value, so those are escaped explicitly. Newlines in a body
 * survive as %0A, which is what makes a multi-paragraph draft arrive intact.
 */
function encodeQueryValue(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Addresses are encoded, then '@' is restored: RFC 6068 keeps it literal in the
 * addr-spec, and some mail clients refuse to open a mailto whose '@' arrived as %40.
 * Everything else stays escaped, so a crafted address still cannot inject a separator.
 */
function encodeAddress(address: string): string {
  return encodeURIComponent(address.trim()).replace(/%40/g, '@');
}

function encodeAddressList(addresses: string[]): string {
  return addresses.map(encodeAddress).join(',');
}

export function buildMailtoLink(draft: EmailDraft): EmailHandoffLink {
  const to = draft.to && draft.to.length > 0 ? encodeAddressList(draft.to) : '';

  const params: string[] = [];
  if (draft.cc?.length) params.push(`cc=${encodeAddressList(draft.cc)}`);
  if (draft.bcc?.length) params.push(`bcc=${encodeAddressList(draft.bcc)}`);
  if (draft.subject) params.push(`subject=${encodeQueryValue(draft.subject)}`);
  if (draft.body) params.push(`body=${encodeQueryValue(draft.body)}`);

  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return { url: `mailto:${to}${query}` };
}

export const mailtoAdapter: EmailAdapter = {
  name: 'mailto',
  buildHandoffLink: buildMailtoLink,
};
