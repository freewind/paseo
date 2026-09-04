import { useCallback, useRef } from "react";
import * as Speech from "expo-speech";

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

/** TTS reading of agent replies via expo-speech (native). */
export function useTts(): UseTtsResult {
  const speakingRef = useRef(false);

  const speak = useCallback(({ text, voiceId }: SpeakTextInput) => {
    if (!text || speakingRef.current) return;
    speakingRef.current = true;
    Speech.speak(text, {
      voice: voiceId ?? undefined,
      language: "zh-CN",
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
