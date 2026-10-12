import { Asset } from "expo-asset";
import { requireOptionalNativeModule } from "expo-modules-core";
import { TURN_COMPLETE_SOUND_SOURCES } from "./turn-complete-sound-assets";
import { resolveTurnCompleteSoundId, type TurnCompleteSoundId } from "./turn-complete-sounds";

interface PaseoNotificationSoundModule {
  play(uri: string): boolean;
}

const soundModule =
  requireOptionalNativeModule<PaseoNotificationSoundModule>("PaseoNotificationSound") ?? null;

/**
 * Play the turn-complete chime without touching the audio session the rest of the app owns.
 *
 * `expo-audio` asks for `AUDIOFOCUS_GAIN` on Android and plays through a non-mixing category on
 * iOS, which stops the user's music, a podcast, or another agent's reply being read aloud. The
 * native module layers the chime on top instead (see `modules/paseo-notification-sound`).
 *
 * Nothing here may interrupt the turn-complete flow: a missing native module (a stale dev client)
 * and a failed load are both swallowed.
 */
export function playNotificationSound(soundId?: string): void {
  const module = soundModule;
  if (!module) return;

  void playResolvedSound(module, resolveTurnCompleteSoundId(soundId)).catch((error) => {
    console.warn("[NotificationSound] Failed to play sound", error);
  });
}

async function playResolvedSound(
  module: PaseoNotificationSoundModule,
  soundId: TurnCompleteSoundId,
): Promise<void> {
  const asset = Asset.fromModule(TURN_COMPLETE_SOUND_SOURCES[soundId] as number);
  await asset.downloadAsync();

  const uri = asset.localUri;
  if (!uri) {
    throw new Error(`Notification sound ${soundId} has no local file`);
  }

  module.play(uri);
}
