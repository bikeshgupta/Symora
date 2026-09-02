/**
 * Side-adapter interfaces (V1 architecture, § Adapter interfaces to create in V1).
 *
 * These are type-only declarations. Implementations arrive in their own phases and live
 * outside this folder. AIProvider, SpeechAdapter, NotificationAdapter, MessagingAdapter,
 * EmailAdapter and StorageAdapter get V1 implementations; EncryptionAdapter and
 * CalendarAdapter remain interfaces only.
 */

export type * from './ai-provider';
export type * from './speech-adapter';
export type * from './notification-adapter';
export type * from './messaging-adapter';
export type * from './email-adapter';
export type * from './storage-adapter';
export type * from './encryption-adapter';
export type * from './calendar-adapter';
