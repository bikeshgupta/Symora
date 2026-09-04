/**
 * POST /api/voice/transcribe — push-to-talk speech-to-text (PROGRESS.md Phase 7).
 *
 * Transcription and interpretation are deliberately two steps. This returns the raw
 * transcript so the user sees exactly what Symora heard before anything acts on it;
 * sending it on to /api/chat is a separate call, flagged `source: 'voice'` so the risk
 * gate knows a monetary amount in it came from speech and must be confirmed
 * (.claude/rules/ai-pipeline.md — speech-to-text confuses digits).
 *
 * Audio arrives base64-encoded in a JSON body rather than as multipart: every other
 * endpoint here speaks JSON, and a push-to-talk clip is small enough that the ~33%
 * encoding overhead is cheaper than a second body parser.
 */

import { z } from 'zod';
import { detectLanguage, openAiSpeechAdapter, type ApiSuccessBody } from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

/** Roughly one minute of Opus. A push-to-talk clip that exceeds this is a mistake. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

const requestSchema = z.object({
  /** Base64-encoded audio, without a data: URL prefix. */
  audio: z.string().min(1),
  mimeType: z.string().min(1).max(100),
  languageHint: z.enum(['en', 'hi', 'hinglish', 'auto']).optional(),
});

export interface TranscribeResponseBody {
  /** Exactly what the provider returned, unedited. */
  transcript: string;
  /** Our own heuristic over the transcript, which is what the chat turn will use. */
  language: 'en' | 'hi' | 'hinglish';
  durationSeconds?: number;
}

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'POST') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/voice/transcribe.`);
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Audio and its mime type are required.');

  const baseMimeType = parsed.data.mimeType.split(';')[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(baseMimeType)) {
    throw new ApiError('VALIDATION_ERROR', 'That audio format is not supported.');
  }

  const audio = Buffer.from(parsed.data.audio, 'base64');
  if (audio.byteLength === 0) throw new ApiError('VALIDATION_ERROR', 'The recording was empty.');
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new ApiError('VALIDATION_ERROR', 'That recording is too long — keep it under a minute.');
  }

  let transcription;
  try {
    transcription = await openAiSpeechAdapter.transcribe({
      audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer,
      mimeType: parsed.data.mimeType,
      languageHint: parsed.data.languageHint,
    });
  } catch (error) {
    // A provider failure is an expected state, not a crash: the user gets a clear
    // message and can type instead (.claude/rules/ai-pipeline.md § Provider and model use).
    throw new ApiError('INTERNAL_ERROR', "I couldn't hear that clearly — try again, or type it.", error);
  }

  if (!transcription.transcript.trim()) {
    throw new ApiError('VALIDATION_ERROR', "I didn't catch anything — try again a bit closer to the mic.");
  }

  ctx.logger.info('voice transcription completed', {
    // The transcript itself is never logged — it is user content.
    durationSeconds: transcription.durationSeconds,
    providerLanguage: transcription.detectedLanguage,
  });

  const body: ApiSuccessBody<TranscribeResponseBody> = {
    data: {
      transcript: transcription.transcript,
      language: detectLanguage(transcription.transcript),
      durationSeconds: transcription.durationSeconds,
    },
  };
  res.status(200).json(body);
});
