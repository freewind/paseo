import { useCallback, useRef } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";

const TURN_COMPLETE_SOUND = require("../../assets/audio/thinking-tone.wav");

/** Plays a short notification sound when an agent finishes a turn (native: expo-audio). */
export function useTurnCompleteSound(): () => void {
  const playerRef = useRef<AudioPlayer | null>(null);

  const playTurnCompleteSound = useCallback(() => {
    try {
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer(TURN_COMPLETE_SOUND);
      }
      playerRef.current.seekTo(0);
      playerRef.current.play();
    } catch (error) {
      // Never let a failed sound interrupt the turn-complete flow.
      console.warn("[TurnCompleteSound] Failed to play sound", error);
    }
  }, []);

  return playTurnCompleteSound;
}
