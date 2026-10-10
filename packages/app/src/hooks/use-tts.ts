import { useCallback } from "react";
import * as Speech from "expo-speech";
import { i18n } from "@/i18n/i18next";
import { createUtteranceCoordinator, type UtteranceCoordinator } from "@/tts/utterance-coordinator";
import { observeAudioFocusLoss } from "@/tts/audio-focus";

export interface SpeakTextInput {
  text: string;
  voiceId?: string | null;
  rate?: number;
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

/** One coordinator per process: expo-speech has a single output, so reads must not interleave. */
let coordinator: UtteranceCoordinator | null = null;
/** Held only while an utterance is in flight; releasing early lets other apps take the floor. */
let releaseAudioFocus: (() => void) | null = null;

function stopWatchingAudioFocus() {
  releaseAudioFocus?.();
  releaseAudioFocus = null;
}

function getCoordinator(): UtteranceCoordinator {
  coordinator ??= createUtteranceCoordinator({
    speak(text, voiceId, onSettled, rate) {
      // Whatever ends the utterance — done, stopped, errored — the focus must go back, or the
      // user's next tap on a third-party player gets a silent app.
      const settle = () => {
        stopWatchingAudioFocus();
        onSettled();
      };
      // Deliberately never awaiting a voice lookup here: expo-speech resolves the voice itself, and
      // on web a stalled lookup would otherwise swallow the utterance entirely.
      Speech.speak(text, {
        // A user-chosen voice wins on every platform; only fall back to the
        // current app language when the default voice is used.
        ...(voiceId ? { voice: voiceId } : { language: i18n.resolvedLanguage ?? "en" }),
        rate,
        onDone: settle,
        onStopped: settle,
        onError: settle,
      });
      stopWatchingAudioFocus();
      releaseAudioFocus = observeAudioFocusLoss(() => {
        // Another app took the audio floor — a dictation keyboard, Siri, a call. Reading has to
        // yield instead of talking over the user.
        coordinator?.stop();
      });
    },
    stop: () => {
      stopWatchingAudioFocus();
      void Speech.stop().catch(() => {});
    },
  });
  return coordinator;
}

/** TTS reading of agent replies via expo-speech (works on native and web). */
export function useTts(): UseTtsResult {
  const speak = useCallback(({ text, voiceId, rate }: SpeakTextInput) => {
    getCoordinator().speak(text, voiceId ?? null, rate);
  }, []);

  const stop = useCallback(() => {
    getCoordinator().stop();
  }, []);

  const getVoices = useCallback(async () => {
    if (cachedVoices) return cachedVoices;
    const voices = await withTimeout(lookupVoices(), cachedVoices ?? []);
    return voices.length > 0 ? voices : (cachedVoices ?? []);
  }, []);

  return { speak, stop, getVoices };
}
