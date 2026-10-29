import type { TurnCompleteSoundId } from "./turn-complete-sounds";

/**
 * Metro 要求 `require` 静态调用并改写成资源 id，所以这张表是唯一接触音频文件的
 * 地方，也不能放进 `turn-complete-sounds.ts`：模块级 `require` 的 `.wav`
 * 在打包器之外（含 vitest）加载不了。
 */
export const TURN_COMPLETE_SOUND_SOURCES: Record<TurnCompleteSoundId, unknown> = {
  default: require("../../assets/audio/thinking-tone.wav"),
  chime: require("../../assets/audio/chime.wav"),
  bell: require("../../assets/audio/bell.wav"),
  ding: require("../../assets/audio/ding.wav"),
  pop: require("../../assets/audio/pop.wav"),
  drop: require("../../assets/audio/drop.wav"),
  woodblock: require("../../assets/audio/woodblock.wav"),
  chord: require("../../assets/audio/chord.wav"),
};
