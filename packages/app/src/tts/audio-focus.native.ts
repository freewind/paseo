import { requireOptionalNativeModule } from "expo-modules-core";

interface PaseoAudioFocusModule {
  startFocus(): void;
  stopFocus(): void;
  addListener(
    eventName: "onAudioFocusLost",
    listener: (event: { reason: string }) => void,
  ): { remove(): void };
}

const audioFocusModule =
  requireOptionalNativeModule<PaseoAudioFocusModule>("PaseoAudioFocus") ?? null;

/**
 * Watch for another app taking over audio while Paseo reads a reply.
 *
 * A third-party dictation keyboard, Siri or a call takes audio focus from the app, and
 * `expo-speech` keeps talking through it. Only the platform knows, so the native side reports the
 * loss and the caller stops reading.
 */
export function observeAudioFocusLoss(onLost: () => void): () => void {
  if (!audioFocusModule) return () => undefined;
  const subscription = audioFocusModule.addListener("onAudioFocusLost", onLost);
  audioFocusModule.startFocus();
  return () => {
    subscription.remove();
    audioFocusModule.stopFocus();
  };
}
