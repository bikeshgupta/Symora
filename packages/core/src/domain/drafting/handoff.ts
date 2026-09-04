/**
 * Turning a drafted message into a one-tap handoff (PROGRESS.md Phase 5).
 *
 * Pure: given a draft and an optional recipient, produce the links the client opens.
 * Symora never transmits anything — the user reviews the prefilled message in WhatsApp
 * or their mail client and sends it themselves.
 */

import { buildMailtoLink } from '../../adapters/mailto-adapter';
import { buildWhatsAppLink } from '../../adapters/whatsapp-adapter';

export type DraftVariant = 'short' | 'detailed';

export interface HandoffRecipient {
  phone?: string;
  email?: string;
  subject?: string;
}

export interface HandoffLinks {
  whatsappUrl: string;
  mailtoUrl: string;
}

export function buildHandoffLinks(text: string, recipient: HandoffRecipient = {}): HandoffLinks {
  return {
    whatsappUrl: buildWhatsAppLink({
      channel: 'whatsapp',
      recipientPhone: recipient.phone,
      text,
    }).url,
    mailtoUrl: buildMailtoLink({
      to: recipient.email ? [recipient.email] : undefined,
      subject: recipient.subject,
      body: text,
    }).url,
  };
}

export interface DraftVariantWithHandoff {
  variant: DraftVariant;
  text: string;
  handoff: HandoffLinks;
}

/** Both variants, each with its own links, so the user can pick either and send. */
export function withHandoff(
  draft: { short: string; detailed: string },
  recipient: HandoffRecipient = {},
): DraftVariantWithHandoff[] {
  return [
    { variant: 'short', text: draft.short, handoff: buildHandoffLinks(draft.short, recipient) },
    {
      variant: 'detailed',
      text: draft.detailed,
      handoff: buildHandoffLinks(draft.detailed, recipient),
    },
  ];
}
