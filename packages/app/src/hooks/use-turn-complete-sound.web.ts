import { useCallback, useRef } from "react";
import { TURN_COMPLETE_SOUND_SOURCES } from "@/audio/turn-complete-sound-assets";
import { resolveTurnCompleteSoundId, type TurnCompleteSoundId } from "@/audio/turn-complete-sounds";

export function useTurnCompleteSound(): (soundId?: string) => void {
  const audioRef = useRef<Map<TurnCompleteSoundId, HTMLAudioElement> | null>(null);

  return useCallback((soundId?: string) => {
    const id = resolveTurnCompleteSoundId(soundId);
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
        // 浏览器可能拦截自动播放；静默忽略——绝不打断回合完成的流程。
      });
    } catch (error) {
      console.warn("[TurnCompleteSound] Failed to play sound", error);
    }
  }, []);
}
