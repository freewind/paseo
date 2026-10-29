import { useCallback, useEffect, useRef } from "react";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { TURN_COMPLETE_SOUND_SOURCES } from "@/audio/turn-complete-sound-assets";
import { resolveTurnCompleteSoundId } from "@/audio/turn-complete-sounds";
import { playFile } from "@/audio/file-playback";

/** 从不回报状态的播放器也必须释放掉。 */
const RELEASE_FALLBACK_MS = 5000;

export function useTurnCompleteSound({ stopPrevious = false }: { stopPrevious?: boolean } = {}): (
  soundId?: string,
) => void {
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  return useCallback(
    (soundId?: string) => {
      if (stopPrevious) {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
      }
      const signal = stopPrevious ? controllerRef.current?.signal : undefined;
      void playTurnCompleteSound(soundId, signal).catch((error) => {
        console.warn("[TurnCompleteSound] Failed to play sound", error);
      });
    },
    [stopPrevious],
  );
}

async function playTurnCompleteSound(soundId?: string, signal?: AbortSignal): Promise<void> {
  const id = resolveTurnCompleteSoundId(soundId);
  // `duckOthers` 让正在播放的声音继续可听：提示音只把它压低
  // 自己那点时间，而不是抢占音频焦点把它停掉。默认的 `AUDIOFOCUS_GAIN` 会
  // 让用户的音乐永久 LOSS，这是这个提示音绝对不能做的事。
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    interruptionMode: "duckOthers",
    interruptionModeAndroid: "duckOthers",
  });
  if (signal?.aborted) return;
  const player = createAudioPlayer(TURN_COMPLETE_SOUND_SOURCES[id] as number);
  if (signal) {
    try {
      await playFile(player, signal);
    } catch (error) {
      if (!signal.aborted) throw error;
    }
    return;
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(fallback);
    subscription.remove();
    player.remove();
  };
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (
      status.didJustFinish ||
      status.playbackState === "error" ||
      status.playbackState === "failed"
    ) {
      release();
    }
  });
  const fallback = setTimeout(release, RELEASE_FALLBACK_MS);
  player.play();
}
