import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface TranscribeResponse {
  transcript: string;
  language: 'en' | 'hi' | 'hinglish';
  durationSeconds?: number;
}

/**
 * Push-to-talk (PROGRESS.md Phase 7), with two paths.
 *
 * When the deployment has a provider key, audio is recorded and sent to
 * /api/voice/transcribe. When it does not, the browser's own Web Speech API does the
 * recognition on the device — no key, no cost, and nothing leaves the browser. Chrome
 * and Edge support it well; Firefox does not, and there the mic is simply hidden rather
 * than offered and then failing.
 *
 * Either way the transcript lands in the input for the user to read and edit before it
 * becomes a request. That review step is the first defence against a misheard digit; the
 * server's rule that a spoken amount always confirms is the second.
 */
export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'unsupported';

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

/**
 * Minimal shape of the Web Speech API. Declared here rather than pulled from lib.dom
 * because the spec is still prefixed in the browsers that implement it, and TypeScript's
 * bundled types do not cover `webkitSpeechRecognition`.
 */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function useVoiceInput(
  onTranscript: (transcript: string) => void,
  options: { useServerTranscription: boolean; language?: 'en' | 'hi' | 'hinglish' } = {
    useServerTranscription: false,
  },
) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const canUseServer = options.useServerTranscription && Boolean(pickMimeType());
  const canUseBrowser = Boolean(getSpeechRecognition());
  const isSupported = canUseServer || canUseBrowser;

  useEffect(() => {
    setState(isSupported ? 'idle' : 'unsupported');
  }, [isSupported]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
  }, []);

  const startBrowserRecognition = useCallback(() => {
    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      setState('unsupported');
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    // Hindi and Hinglish both do better under hi-IN than en-US: it handles Devanagari
    // output and code-switched speech, where an en-US model mangles the Hindi half.
    recognition.lang = options.language === 'en' ? 'en-IN' : 'hi-IN';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i]![0]!.transcript)
        .join(' ')
        .trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? 'Symora needs microphone permission to listen.'
          : "I couldn't hear that clearly — try again, or type it.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setState('idle');
    };

    setError(null);
    recognition.start();
    setState('recording');
  }, [onTranscript, options.language]);

  const startServerRecording = useCallback(async () => {
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
      // Release the mic as soon as recording ends, not when the request returns —
      // leaving the browser's recording indicator on during a round trip reads as
      // Symora still listening.
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

    setError(null);
    recorder.start();
    setState('recording');
  }, [onTranscript]);

  const start = useCallback(async () => {
    if (canUseServer) {
      await startServerRecording();
      return;
    }
    startBrowserRecognition();
  }, [canUseServer, startServerRecording, startBrowserRecognition]);

  return { state, error, start, stop, isSupported, usesBrowserRecognition: !canUseServer && canUseBrowser };
}
