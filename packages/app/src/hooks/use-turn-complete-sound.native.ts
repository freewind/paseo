import { useCallback } from "react";
import { playNotificationSound } from "@/audio/notification-sound";

/** Plays a short notification sound when an agent finishes a turn (native). */
export function useTurnCompleteSound(): (soundId?: string) => void {
  return useCallback((soundId?: string) => {
    playNotificationSound(soundId);
  }, []);
}
