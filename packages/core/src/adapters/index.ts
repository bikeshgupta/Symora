/**
 * Side-adapter interfaces (V1 architecture, § Adapter interfaces to create in V1).
 *
 * These are type-only declarations. Implementations arrive in their own phases and live
 * outside this folder. AIProvider, SpeechAdapter, NotificationAdapter, MessagingAdapter,
 * EmailAdapter and StorageAdapter get V1 implementations; EncryptionAdapter and
 * CalendarAdapter remain interfaces only.
 */

export type * from './ai-provider';
export { openAiProvider } from './openai-provider';
export type * from './speech-adapter';
export type * from './notification-adapter';
export type * from './messaging-adapter';
export type * from './email-adapter';
export type * from './storage-adapter';
export type * from './encryption-adapter';
export type * from './calendar-adapter';

/**
 * Implementations. AIProvider (OpenAI) landed in Phase 2; the two handoff adapters are
 * Phase 5. EncryptionAdapter and CalendarAdapter stay interfaces only — see their files.
 */
export { buildWhatsAppLink, normalizePhone, whatsAppAdapter } from './whatsapp-adapter';
export { buildMailtoLink, mailtoAdapter } from './mailto-adapter';
