import { useCallback, useRef } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import {
  DEFAULT_TURN_COMPLETE_SOUND,
  isTurnCompleteSoundId,
  TURN_COMPLETE_SOUND_SOURCES,
  type TurnCompleteSoundId,
} from "@/audio/turn-complete-sounds";

/** Plays a short notification sound when an agent finishes a turn (native: expo-audio). */
export function useTurnCompleteSound(): (soundId?: string) => void {
  const playersRef = useRef<Map<TurnCompleteSoundId, AudioPlayer> | null>(null);

  const playTurnCompleteSound = useCallback((soundId?: string) => {
    const id: TurnCompleteSoundId =
      soundId && isTurnCompleteSoundId(soundId) ? soundId : DEFAULT_TURN_COMPLETE_SOUND;
    try {
      if (!playersRef.current) {
        playersRef.current = new Map();
      }
      let player = playersRef.current.get(id);
      if (!player) {
        player = createAudioPlayer(TURN_COMPLETE_SOUND_SOURCES[id] as number);
        playersRef.current.set(id, player);
      }
      player.seekTo(0);
      player.play();
    } catch (error) {
      // Never let a failed sound interrupt the turn-complete flow.
      console.warn("[TurnCompleteSound] Failed to play sound", error);
    }
  }, []);

  return playTurnCompleteSound;
}
