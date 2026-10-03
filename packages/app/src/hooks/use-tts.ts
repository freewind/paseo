import { useCallback, useRef } from "react";
import * as Speech from "expo-speech";
import { i18n } from "@/i18n/i18next";

export interface SpeakTextInput {
  text: string;
  voiceId?: string | null;
}

export interface TtsVoice {
  identifier: string;
  name: string;
  language: string;
}

export interface UseTtsResult {
  /** Speaks text aloud (stripped of markdown), optionally with a chosen voice. */
  speak: (input: SpeakTextInput) => void;
  /** Stops any in-progress utterance (e.g. when a new turn starts). */
  stop: () => void;
  /** Lists the device's available voices for the settings picker. */
  getVoices: () => Promise<TtsVoice[]>;
}

/** Voice lists are static for the life of the process, so the first non-empty result is reused. */
let cachedVoices: TtsVoice[] | null = null;
/** In-flight lookup, so concurrent callers share one query instead of racing. */
let voicesLookup: Promise<TtsVoice[]> | null = null;

/**
 * `getAvailableVoicesAsync()` only settles from the *next* `voiceschanged` event on web: Electron
 * (macOS) reports an empty list on the first read and fires that event once afterwards, so a
 * lookup made after it already fired never settles. Bounding the wait keeps the settings picker
 * rendering and keeps a stalled lookup from leaving a requested voice silent.
 */
const VOICES_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), VOICES_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).then(
    (value) => {
      clearTimeout(timer);
      return value;
    },
    () => {
      clearTimeout(timer);
      return fallback;
    },
  );
}

function lookupVoices(): Promise<TtsVoice[]> {
  if (!voicesLookup) {
    voicesLookup = Speech.getAvailableVoicesAsync().then(
      (voices) => {
        const mapped = voices.map((voice) => ({
          identifier: voice.identifier,
          name: voice.name,
          language: voice.language,
        }));
        // An empty list is neither cached nor memoized: voices can be published later, so the
        // next caller retries instead of being pinned to the empty answer.
        if (mapped.length > 0) cachedVoices = mapped;
        else voicesLookup = null;
        return mapped;
      },
      () => {
        // Let a later caller retry instead of reusing the failed lookup.
        voicesLookup = null;
        return cachedVoices ?? [];
      },
    );
  }
  return voicesLookup;
}

/** TTS reading of agent replies via expo-speech (works on native and web). */
export function useTts(): UseTtsResult {
  const speakingRef = useRef(false);

  const speak = useCallback(({ text, voiceId }: SpeakTextInput) => {
    if (!text || speakingRef.current) return;
    speakingRef.current = true;
    // Deliberately never awaiting a voice lookup here: expo-speech resolves the voice itself, and
    // on web a stalled lookup would otherwise swallow the utterance entirely.
    Speech.speak(text, {
      // A user-chosen voice wins on every platform; only fall back to the
      // current app language when the default voice is used.
      ...(voiceId ? { voice: voiceId } : { language: i18n.resolvedLanguage ?? "en" }),
      onDone: () => {
        speakingRef.current = false;
      },
      onStopped: () => {
        speakingRef.current = false;
      },
      onError: () => {
        speakingRef.current = false;
      },
    });
  }, []);

  const stop = useCallback(() => {
    speakingRef.current = false;
    void Speech.stop().catch(() => {});
  }, []);

  const getVoices = useCallback(async () => {
    if (cachedVoices) return cachedVoices;
    const voices = await withTimeout(lookupVoices(), cachedVoices ?? []);
    return voices.length > 0 ? voices : (cachedVoices ?? []);
  }, []);

  return { speak, stop, getVoices };
}
