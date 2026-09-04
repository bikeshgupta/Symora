import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface TranscribeResponse {
  transcript: string;
  language: 'en' | 'hi' | 'hinglish';
  durationSeconds?: number;
}

/**
 * Push-to-talk recording (PROGRESS.md Phase 7).
 *
 * The transcript is returned to the caller rather than sent anywhere: the user sees
 * exactly what Symora heard and can edit it before it becomes a request. That review
 * step is also the first line of defence against speech-to-text mangling a digit — the
 * server's risk gate is the second (a voice turn carrying an amount always confirms).
 */
export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'unsupported';

/** Ordered by preference; the first the browser can encode wins. */
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked to avoid blowing the argument limit on String.fromCharCode for a long clip.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function useVoiceInput(onTranscript: (transcript: string) => void) {
  const [state, setState] = useState<VoiceState>(() =>
    typeof navigator !== 'undefined' && navigator.mediaDevices && pickMimeType() ? 'idle' : 'unsupported',
  );
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const mimeType = pickMimeType();
    if (!mimeType) {
      setState('unsupported');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Symora needs microphone permission to listen.');
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      // Release the mic as soon as recording ends, not when transcription returns —
      // leaving the browser's recording indicator on during a network round trip reads
      // as Symora still listening.
      stream.getTracks().forEach((track) => track.stop());
      setState('transcribing');

      try {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const response = await apiFetch<TranscribeResponse>('/api/voice/transcribe', {
          method: 'POST',
          body: JSON.stringify({ audio: await toBase64(blob), mimeType }),
        });
        onTranscript(response.transcript);
      } catch (err) {
        setError(err instanceof Error ? err.message : "I couldn't hear that clearly.");
      } finally {
        setState('idle');
      }
    };

    recorder.start();
    setState('recording');
  }, [onTranscript]);

  return { state, error, start, stop, isSupported: state !== 'unsupported' };
}
