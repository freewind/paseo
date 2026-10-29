export const TURN_COMPLETE_SOUND_IDS = [
  "chime",
  "bell",
  "ding",
  "pop",
  "drop",
  "woodblock",
  "chord",
] as const;

export type TurnCompleteSoundId = (typeof TURN_COMPLETE_SOUND_IDS)[number];
export function isTurnCompleteSoundId(value: string): value is TurnCompleteSoundId {
  return (TURN_COMPLETE_SOUND_IDS as readonly string[]).includes(value);
}

/** 未知或缺失的 id 回落到列表第一个音效，过期的设置不会变成一声不响。 */
export function resolveTurnCompleteSoundId(value?: string): TurnCompleteSoundId {
  return value && isTurnCompleteSoundId(value) ? value : TURN_COMPLETE_SOUND_IDS[0];
}
