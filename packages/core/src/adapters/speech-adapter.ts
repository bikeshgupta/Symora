/**
 * SpeechAdapter — speech-to-text behind an abstraction.
 *
 * V1 supports push-to-talk transcription for English, Hindi and Hinglish. The raw
 * transcript is always retained. Monetary amounts extracted from voice always require
 * confirmation — see .claude/rules/ai-pipeline.md.
 *
 * Type-only stub. Phase 7 provides the implementation.
 */

export type SpeechLanguageHint = 'en' | 'hi' | 'hinglish' | 'auto';

export interface TranscriptionRequest {
  audio: ArrayBuffer;
  /** MIME type of the supplied audio, e.g. 'audio/webm'. */
  mimeType: string;
  languageHint?: SpeechLanguageHint;
  timeoutMs?: number;
}

export interface TranscriptionResult {
  /** The raw transcript exactly as returned by the provider. Never discarded. */
  transcript: string;
  detectedLanguage: SpeechLanguageHint;
  /** Provider confidence in [0, 1] when available. */
  confidence?: number;
  durationSeconds?: number;
}

export interface SpeechAdapter {
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
