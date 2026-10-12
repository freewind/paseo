import type { TurnCompleteSoundId } from "./turn-complete-sounds";

/**
 * Bundled turn-complete sounds.
 *
 * Metro's bundler requires static `require` calls and rewrites them into asset ids, so this map is
 * the one place the app touches the audio files and stays out of `turn-complete-sounds.ts`: a
 * module-scope `require` of a `.wav` cannot be loaded outside the bundler (vitest included).
 */
export const TURN_COMPLETE_SOUND_SOURCES: Record<TurnCompleteSoundId, unknown> = {
  default: require("../../assets/audio/thinking-tone.wav"),
  chime: require("../../assets/audio/chime.wav"),
  bell: require("../../assets/audio/bell.wav"),
  pop: require("../../assets/audio/pop.wav"),
  ding: require("../../assets/audio/ding.wav"),
};
