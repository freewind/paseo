/**
 * Single-reader arbitration for TTS.
 *
 * expo-speech has one output per process, so a second utterance has to interrupt the first
 * rather than queue behind it. Every start bumps a generation counter and the platform
 * callbacks only settle the utterance that still owns it, so a late `onStopped` from the
 * utterance we just interrupted cannot mark the new one as finished.
 */
export interface UtteranceCoordinatorDeps {
  /** Starts a platform utterance and reports back when it settles for any reason. */
  speak: (text: string, voiceId: string | null, onSettled: () => void, rate: number) => void;
  /** Interrupts the platform utterance currently in progress. */
  stop: () => void;
}

export interface UtteranceCoordinator {
  /** Reads `text` in `voiceId`, interrupting anything currently being read. */
  speak: (text: string, voiceId: string | null, rate?: number) => void;
  /** Interrupts the current utterance. */
  stop: () => void;
  /** Whether an utterance started here is still in progress. */
  isSpeaking: () => boolean;
}

export function createUtteranceCoordinator(deps: UtteranceCoordinatorDeps): UtteranceCoordinator {
  let generation = 0;
  let speaking = false;

  return {
    speak(text: string, voiceId: string | null, rate = 1) {
      if (!text) {
        return;
      }
      const own = ++generation;
      // Interrupt first: a queued utterance would read the stale reply to completion.
      if (speaking) {
        deps.stop();
      }
      speaking = true;
      deps.speak(
        text,
        voiceId,
        () => {
          if (own === generation) {
            speaking = false;
          }
        },
        rate,
      );
    },
    stop() {
      generation += 1;
      speaking = false;
      deps.stop();
    },
    isSpeaking() {
      return speaking;
    },
  };
}
