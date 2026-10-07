import { useCallback, useRef } from "react";
import {
  DEFAULT_TURN_COMPLETE_SOUND,
  isTurnCompleteSoundId,
  TURN_COMPLETE_SOUND_SOURCES,
  type TurnCompleteSoundId,
} from "@/audio/turn-complete-sounds";

/** Plays a short notification sound when an agent finishes a turn (web: HTML Audio). */
export function useTurnCompleteSound(): (soundId?: string) => void {
  const audioRef = useRef<Map<TurnCompleteSoundId, HTMLAudioElement> | null>(null);

  const playTurnCompleteSound = useCallback((soundId?: string) => {
    const id: TurnCompleteSoundId =
      soundId && isTurnCompleteSoundId(soundId) ? soundId : DEFAULT_TURN_COMPLETE_SOUND;
    try {
      if (!audioRef.current) {
        audioRef.current = new Map();
      }
      let audio = audioRef.current.get(id);
      if (!audio) {
        audio = new Audio(TURN_COMPLETE_SOUND_SOURCES[id] as string);
        audioRef.current.set(id, audio);
      }
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Browsers may block autoplay; ignore silently — never interrupt the turn-complete flow.
      });
    } catch (error) {
      console.warn("[TurnCompleteSound] Failed to play sound", error);
    }
  }, []);

  return playTurnCompleteSound;
}
