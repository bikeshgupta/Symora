/**
 * Template message drafting for the offline (no-AI-key) mode.
 *
 * Returns the same two variants the AI path returns — short, and warmer — so
 * `MessageDraftCard` and the WhatsApp/email handoff work unchanged. The difference is
 * honest: these are templates filled from what the user typed, not written prose. They
 * are meant to be edited before sending, which is what the handoff already assumes.
 */

import type { DraftMessageResult } from '../../domain/drafting/draft-service';

const NO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };

/** Sentence-cases the request so it reads as a line of a message, not a command. */
function asRequest(context: string): string {
  const trimmed = context.trim().replace(/[.!]+$/, '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function greeting(relationship: string | undefined): string {
  if (!relationship) return 'Hi';
  const name = relationship.trim();
  // A relationship word ("electrician", "landlord") is not a name, so it is not used as
  // one — "Hi electrician" reads worse than a plain "Hi".
  return /^[A-Z]/.test(name) && !name.includes(' ') ? `Hi ${name}` : 'Hi';
}

export function draftMessageOffline(
  args: { context: string; recipientRelationship?: string },
  language: 'en' | 'hi' | 'hinglish',
): DraftMessageResult {
  const request = asRequest(args.context);
  const hello = greeting(args.recipientRelationship);

  if (language === 'hi') {
    return {
      short: `नमस्ते, ${request}. धन्यवाद.`,
      detailed: `नमस्ते,\n\nउम्मीद है आप ठीक होंगे. ${request}.\n\nबताइएगा कि यह आपके लिए ठीक रहेगा या नहीं. धन्यवाद.`,
      model: 'offline-template',
      usage: NO_USAGE,
    };
  }

  if (language === 'hinglish') {
    return {
      short: `${hello}, ${request}. Thanks!`,
      detailed: `${hello},\n\nUmeed hai aap theek honge. ${request}.\n\nBata dijiyega agar yeh theek rahega. Thank you!`,
      model: 'offline-template',
      usage: NO_USAGE,
    };
  }

  return {
    short: `${hello}, ${request}. Thanks!`,
    detailed: `${hello},\n\nHope you're doing well. ${request}.\n\nDo let me know if that works for you. Thanks so much!`,
    model: 'offline-template',
    usage: NO_USAGE,
  };
}
