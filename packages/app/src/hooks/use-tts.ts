import { useCallback, useRef } from "react";
import * as Speech from "expo-speech";
import { i18n } from "@/i18n/i18next";

export interface SpeakTextInput {
  text: string;
  voiceId?: string | null;
}

export interface UseTtsResult {
  /** Speaks text aloud (stripped of markdown), optionally with a chosen voice. */
  speak: (input: SpeakTextInput) => void;
  /** Stops any in-progress utterance (e.g. when a new turn starts). */
  stop: () => void;
  /** Lists the device's available voices for the settings picker. */
  getVoices: () => Promise<{ identifier: string; name: string; language: string }[]>;
}

/** TTS reading of agent replies via expo-speech (works on native and web). */
export function useTts(): UseTtsResult {
  const speakingRef = useRef(false);

  const speak = useCallback(({ text, voiceId }: SpeakTextInput) => {
    if (!text || speakingRef.current) return;
    speakingRef.current = true;
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
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((voice) => ({
      identifier: voice.identifier,
      name: voice.name,
      language: voice.language,
    }));
  }, []);

  return { speak, stop, getVoices };
}
