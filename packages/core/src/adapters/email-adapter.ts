/**
 * EmailAdapter — handing a drafted email off to the user's mail client.
 *
 * V1 builds a mailto prefill. Symora does not send email on the user's behalf, and full
 * Gmail integration is future scope.
 *
 * Type-only stub. Phase 5 provides the link-building implementation.
 */

export interface EmailDraft {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
}

export interface EmailHandoffLink {
  /** mailto: URL the client opens so the user can review and send it themselves. */
  url: string;
}

export interface EmailAdapter {
  readonly name: string;
  /** Builds a mailto prefill. V1 implementations must not transmit anything. */
  buildHandoffLink(draft: EmailDraft): EmailHandoffLink;
}
