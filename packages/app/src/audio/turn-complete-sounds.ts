export const TURN_COMPLETE_SOUND_IDS = ["default", "chime", "bell", "pop", "ding"] as const;

export type TurnCompleteSoundId = (typeof TURN_COMPLETE_SOUND_IDS)[number];

export const DEFAULT_TURN_COMPLETE_SOUND: TurnCompleteSoundId = "default";

export function isTurnCompleteSoundId(value: string): value is TurnCompleteSoundId {
  return (TURN_COMPLETE_SOUND_IDS as readonly string[]).includes(value);
}

/** Unknown or missing ids fall back to the default sound, so a stale setting never plays nothing. */
export function resolveTurnCompleteSoundId(value?: string): TurnCompleteSoundId {
  return value && isTurnCompleteSoundId(value) ? value : DEFAULT_TURN_COMPLETE_SOUND;
}
