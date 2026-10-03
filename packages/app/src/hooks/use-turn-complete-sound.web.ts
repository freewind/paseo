import { useCallback, useRef } from "react";

const TURN_COMPLETE_SOUND = require("../../assets/audio/thinking-tone.wav");

/** Plays a short notification sound when an agent finishes a turn (web: HTML Audio). */
export function useTurnCompleteSound(): () => void {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playTurnCompleteSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(TURN_COMPLETE_SOUND);
      }
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        // Browsers may block autoplay; ignore silently — never interrupt the turn-complete flow.
      });
    } catch (error) {
      console.warn("[TurnCompleteSound] Failed to play sound", error);
    }
  }, []);

  return playTurnCompleteSound;
}
