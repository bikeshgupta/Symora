/**
 * MessagingAdapter — handing a drafted message off to a messaging app.
 *
 * V1 builds a wa.me link with prefilled text and hands it to the user. There is no
 * WhatsApp Business API in V1 and Symora never sends a message on the user's behalf.
 * Automatic sending is future scope.
 *
 * Type-only stub. Phase 5 provides the link-building implementation.
 */

export type MessagingChannel = 'whatsapp';

export interface MessageHandoffRequest {
  channel: MessagingChannel;
  /** Recipient phone number in E.164 form, when known. */
  recipientPhone?: string;
  /** The drafted text to prefill. Never sent automatically in V1. */
  text: string;
}

export interface MessageHandoffLink {
  /** URL the client opens so the user can review and send the message themselves. */
  url: string;
  channel: MessagingChannel;
}

export interface MessagingAdapter {
  readonly name: string;
  readonly channel: MessagingChannel;
  /** Builds a handoff link. V1 implementations must not transmit anything. */
  buildHandoffLink(request: MessageHandoffRequest): MessageHandoffLink;
}
