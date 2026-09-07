/**
 * "Hello Symora" — the turn that is not one of the twelve V1 intents.
 *
 * A greeting used to fall all the way through extraction to "I'm not sure I understood
 * that", which is both untrue (it was understood perfectly) and a bad first impression:
 * the very first thing most people type to an assistant is hello, and the answer decided
 * whether they believed anything else would work.
 *
 * This is deliberately *not* a thirteenth intent (.claude/rules/ai-pipeline.md: "Do not
 * invent a new intent to make an input fit"). A greeting writes nothing, so it belongs on
 * the conversational branch the pipeline already has — it just gets a useful answer there
 * instead of an apology, and the answer names what Symora can actually do.
 *
 * Detection is deterministic and runs before extraction, so a greeting costs no model
 * call and behaves identically offline, unreachable and ready. It matches the *whole*
 * message, never a prefix: "hi, remind me to call the doctor" is a reminder, and treating
 * it as small talk would silently drop a real request.
 */

import type { MessageLanguage } from '../../types/conversation';
import type { ChatUiSchema } from '../../types/chat';

export interface CapabilitySuggestion {
  id: string;
  label: string;
  /** Prefilled text for the composer when the chip is tapped. */
  prompt: string;
}

export type SmallTalkKind = 'greeting' | 'capabilities';

/**
 * The five things offered to someone who has just said hello, one per V1 area that a
 * first-time user can try in a single sentence. Each `prompt` is a phrasing the offline
 * rule parser also understands, so tapping a chip works with no model configured — an
 * example that only works on a good day is worse than no example.
 */
const CAPABILITIES: Record<MessageLanguage, readonly CapabilitySuggestion[]> = {
  en: [
    { id: 'cap-payment', label: 'Track a recurring payment', prompt: 'Home loan 42500 every month on the 5th' },
    { id: 'cap-paid', label: 'Mark something paid', prompt: 'Paid the electricity bill today' },
    { id: 'cap-reminder', label: 'Remind me about something', prompt: 'Remind me to call the doctor tomorrow' },
    { id: 'cap-memory', label: 'Remember a detail', prompt: 'Remember my landlord is Rakesh Sharma' },
    { id: 'cap-draft', label: 'Draft a message', prompt: 'Draft a message to my landlord about the rent' },
  ],
  hi: [
    { id: 'cap-payment', label: 'हर महीने का भुगतान जोड़ें', prompt: 'होम लोन 42500 हर महीने 5 तारीख को' },
    { id: 'cap-paid', label: 'भुगतान हो गया, यह दर्ज करें', prompt: 'बिजली का बिल आज भर दिया' },
    { id: 'cap-reminder', label: 'याद दिलाने को कहें', prompt: 'कल डॉक्टर को फोन करने की याद दिलाना' },
    { id: 'cap-memory', label: 'कोई बात याद रखवाएँ', prompt: 'याद रखना मेरे मकान मालिक राकेश शर्मा हैं' },
    { id: 'cap-draft', label: 'संदेश तैयार करवाएँ', prompt: 'मकान मालिक को किराए के बारे में संदेश लिखो' },
  ],
  hinglish: [
    { id: 'cap-payment', label: 'Har mahine ka payment jodein', prompt: 'Home loan 42500 har mahine 5 tarikh ko' },
    { id: 'cap-paid', label: 'Payment ho gaya, mark karein', prompt: 'Bijli ka bill aaj bhar diya' },
    { id: 'cap-reminder', label: 'Yaad dilane ko kahein', prompt: 'Kal doctor ko call karne ki yaad dilana' },
    { id: 'cap-memory', label: 'Koi baat yaad rakhwayein', prompt: 'Yaad rakhna mere landlord Rakesh Sharma hain' },
    { id: 'cap-draft', label: 'Message draft karwayein', prompt: 'Landlord ko rent ke baare mein message likho' },
  ],
};

export function capabilitySuggestions(language: MessageLanguage): readonly CapabilitySuggestion[] {
  return CAPABILITIES[language] ?? CAPABILITIES.en;
}

/**
 * Anything longer than this is not small talk, whatever it starts with. A cheap guard so
 * a long message can never be matched away by a greeting pattern.
 */
const MAX_SMALL_TALK_LENGTH = 80;

/** Words that carry no meaning of their own around a greeting. */
const FILLER =
  /\b(?:symora|there|dear|ji|sir|madam|maam|please|plz|pls|bot|buddy|friend|again)\b/g;

/** "hi", "hello", "namaste", "good morning" — the opener itself, in all three languages. */
const OPENER =
  '(?:h+i+|h+e+y+|h+e+l+o+|h+a+l+o+|hola|yo|sup|greetings|good\\s?(?:morning|afternoon|evening|day)|' +
  'gm|namaste+|namastey|namaskar|namaskaar|salaam|salam|assalam(?:u)?\\s?alaikum|adaab|pranaam|' +
  'नमस्ते|नमस्कार|नमस्ते जी|हैलो|हेलो|हाय|प्रणाम|शुभ\\s?(?:प्रभात|संध्या|रात्रि))';

/** "how are you", "kaise ho", "kya haal hai" — the polite follow-up, on its own or after an opener. */
const PLEASANTRY =
  '(?:how\\s?(?:are|r)\\s?(?:you|u)(?:\\s?doing)?|how\\s?(?:is|s)\\s?it\\s?going|how\\s?do\\s?you\\s?do|' +
  'kaise\\s?ho(?:\\s?aap)?|kaisi\\s?ho|kaise\\s?hain(?:\\s?aap)?|kya\\s?haal(?:\\s?(?:hai|chaal))?|' +
  'kya\\s?chal\\s?raha\\s?hai|sab\\s?(?:theek|thik)(?:\\s?hai)?|' +
  'कैसे\\s?हो|कैसी\\s?हो|कैसे\\s?हैं|क्या\\s?हाल\\s?है|सब\\s?ठीक(?:\\s?है)?)';

const GREETING = new RegExp(`^(?:${OPENER}\\s*)+(?:${PLEASANTRY})?$|^${PLEASANTRY}$`);

/** "what can you do", "help", "aap kya kar sakte ho" — asking for the tour outright. */
const CAPABILITY_QUESTION = new RegExp(
  `^(?:${OPENER}\\s*)*(?:` +
    'what\\s?can\\s?(?:you|u|symora)\\s?do|what\\s?do\\s?(?:you|u)\\s?do|what\\s?can\\s?i\\s?ask|' +
    'what\\s?are\\s?(?:you|u)|who\\s?are\\s?(?:you|u)|how\\s?can\\s?(?:you|u)\\s?help(?:\\s?me)?|' +
    'help|what\\s?is\\s?this|show\\s?me\\s?(?:what\\s?)?(?:you\\s?can\\s?do|around)|' +
    'aap\\s?kya\\s?kar\\s?(?:sakte|sakti)\\s?(?:ho|hain)|tum\\s?kya\\s?kar\\s?(?:sakte|sakti)\\s?ho|' +
    'kya\\s?kar\\s?(?:sakte|sakti)\\s?(?:ho|hain)|madad\\s?chahiye|' +
    'आप\\s?क्या\\s?कर\\s?(?:सकते|सकती)\\s?(?:हो|हैं)|तुम\\s?क्या\\s?कर\\s?(?:सकते|सकती)\\s?हो|मदद\\s?चाहिए' +
    ')$',
);

/**
 * Strips what a greeting can carry without changing what it is: punctuation, emoji,
 * repeated whitespace, and the name or honorific it was addressed to.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    // Emoji, and separately their invisible companions: the variation selector and the
    // skin-tone modifiers are marks and joiners, so the class below would keep them and
    // leave an invisible character in an otherwise-clean "hi 👋".
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\u{FE0F}|\u{200D}|[\u{1F3FB}-\u{1F3FF}]/gu, ' ')
    // \p{M} keeps combining marks: Devanagari matras and the virama are marks, not
    // letters, and dropping them turns "नमस्ते" into "नमसत" — a greeting no pattern
    // would ever match again.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether this turn is small talk, and which kind — `null` for everything else, which is
 * the overwhelmingly common answer. The caller only short-circuits on a non-null result,
 * so a miss here costs nothing: the turn goes through extraction exactly as before.
 */
export function detectSmallTalk(text: string): SmallTalkKind | null {
  if (text.length > MAX_SMALL_TALK_LENGTH) return null;
  const normalized = normalize(text);
  if (!normalized) return null;
  if (GREETING.test(normalized)) return 'greeting';
  if (CAPABILITY_QUESTION.test(normalized)) return 'capabilities';
  return null;
}

const OPENING_LINE: Record<MessageLanguage, (name: string | null) => string> = {
  en: (name) => `Hello${name ? `, ${name}` : ''} — how can I help you today?`,
  // Phrased around the user rather than the assistant, so the sentence never has to give
  // Symora a gender that Hindi verbs would otherwise force on it.
  hi: (name) => `नमस्ते${name ? ` ${name}` : ''} — बताइए, आज किस चीज़ में मदद चाहिए?`,
  hinglish: (name) => `Hello${name ? ` ${name}` : ''} — bataiye, aaj kis cheez mein madad chahiye?`,
};

const CAPABILITY_LINE: Record<MessageLanguage, string> = {
  en: 'Here are five things people ask me for most — tap one to try it.',
  hi: 'ये पाँच काम सबसे ज़्यादा पूछे जाते हैं — किसी एक पर टैप करके देखिए।',
  hinglish: 'Ye paanch cheezein sabse zyada poochi jaati hain — kisi ek par tap karke dekhiye.',
};

/**
 * The greeting reply: an answer to the question, and five things to try.
 *
 * The five live in the chips rather than in the message text. Spelling them out in both
 * places was the first thing tried and it read as a wall on a phone — the same five
 * labels twice, once as bullets and once as buttons. The text and the chips are always
 * returned together in one response, so the invitation is never left unfulfilled.
 */
export function composeSmallTalk(
  language: MessageLanguage,
  displayName: string | null,
): { text: string; ui: ChatUiSchema } {
  const suggestions = capabilitySuggestions(language);
  const firstName = displayName?.trim().split(/\s+/)[0] ?? null;
  const text = `${OPENING_LINE[language](firstName)}\n\n${CAPABILITY_LINE[language]}`;

  return {
    text,
    ui: { component: 'suggestion-chips', props: { suggestions: [...suggestions] } },
  };
}
