/**
 * SpeechAdapter implementation (PROGRESS.md Phase 7). Push-to-talk transcription for
 * English, Hindi and Hinglish via OpenAI's transcription endpoint.
 *
 * The raw transcript is returned exactly as the provider gave it and is never "cleaned
 * up" here. It is what gets stored on the message row, so a later parsing bug can be
 * traced to what was actually said rather than to something this file rewrote.
 *
 * The provider SDK is imported only in this file — the domain layer talks to the
 * SpeechAdapter interface (.claude/rules/ai-pipeline.md § Provider and model use).
 */

import OpenAI from 'openai';
import { getAiApiKey, readTimeoutMs } from '../config/ai-config';
import type {
  SpeechAdapter,
  SpeechLanguageHint,
  TranscriptionRequest,
  TranscriptionResult,
} from './speech-adapter';

/**
 * Deliberately does NOT honour AI_BASE_URL.
 *
 * A self-hosted chat endpoint is not a speech endpoint — pointing transcription at
 * Ollama would 404 on the first press of the mic. Speech goes to the hosted API or
 * nowhere, and `getRuntimeCapabilities` reports `serverTranscription: false` in every
 * other case so the client uses the browser's own recogniser instead of offering a mic
 * that cannot work.
 */
function getClient(): OpenAI {
  const apiKey = getAiApiKey();
  if (!apiKey) throw new Error('AI_API_KEY (or OPENAI_API_KEY) is not configured.');
  return new OpenAI({ apiKey });
}

function modelName(): string {
  return process.env.SPEECH_MODEL ?? 'whisper-1';
}

/**
 * Whisper takes an ISO-639-1 hint. Hinglish has no code of its own, and forcing 'en' on
 * romanized Hindi makes the transcript worse — so Hinglish and 'auto' both send no hint
 * and let the model detect, which handles code-switching better than a wrong hint does.
 */
function languageParam(hint: SpeechLanguageHint | undefined): string | undefined {
  if (hint === 'en') return 'en';
  if (hint === 'hi') return 'hi';
  return undefined;
}

export const openAiSpeechAdapter: SpeechAdapter = {
  name: 'openai-whisper',

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const timeoutMs = request.timeoutMs ?? readTimeoutMs(process.env.SPEECH_REQUEST_TIMEOUT_MS, 30_000);

    // The SDK wants a File; the extension has to match the actual container or the
    // service rejects it, so it is derived from the MIME type rather than hardcoded.
    const extension = request.mimeType.split('/')[1]?.split(';')[0] ?? 'webm';
    // Wrapped in a view rather than passed raw: File's BlobPart accepts an ArrayBuffer
    // view, not a bare ArrayBuffer, under the SDK's types.
    const file = new File([new Uint8Array(request.audio)], `speech.${extension}`, {
      type: request.mimeType,
    });

    const response = await getClient().audio.transcriptions.create(
      {
        file,
        model: modelName(),
        language: languageParam(request.languageHint),
        // verbose_json returns the language the model actually detected, which is more
        // trustworthy than our own heuristic on a romanized transcript.
        response_format: 'verbose_json',
      },
      { timeout: timeoutMs },
    );

    const verbose = response as unknown as { text: string; language?: string; duration?: number };
    const detected: SpeechLanguageHint =
      verbose.language === 'hindi' || verbose.language === 'hi' ? 'hi' : verbose.language === 'english' || verbose.language === 'en' ? 'en' : 'auto';

    return {
      transcript: verbose.text,
      detectedLanguage: detected,
      durationSeconds: verbose.duration,
    };
  },
};
