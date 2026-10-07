export const TURN_COMPLETE_SOUND_IDS = ["default", "chime", "bell", "pop", "ding"] as const;

export type TurnCompleteSoundId = (typeof TURN_COMPLETE_SOUND_IDS)[number];

export const DEFAULT_TURN_COMPLETE_SOUND: TurnCompleteSoundId = "default";

export function isTurnCompleteSoundId(value: string): value is TurnCompleteSoundId {
  return (TURN_COMPLETE_SOUND_IDS as readonly string[]).includes(value);
}

/** Metro/bundler requires static require calls; keep the mapping exhaustive. */
export const TURN_COMPLETE_SOUND_SOURCES: Record<TurnCompleteSoundId, unknown> = {
  default: require("../../assets/audio/thinking-tone.wav"),
  chime: require("../../assets/audio/chime.wav"),
  bell: require("../../assets/audio/bell.wav"),
  pop: require("../../assets/audio/pop.wav"),
  ding: require("../../assets/audio/ding.wav"),
};
