import { describe, expect, it } from "vitest";
import {
  createUtteranceCoordinator,
  type UtteranceCoordinator,
  type UtteranceCoordinatorDeps,
} from "./utterance-coordinator";

interface Harness {
  coordinator: UtteranceCoordinator;
  started: { text: string; voiceId: string | null }[];
  stopCount: () => number;
  settle: (index: number) => void;
}

function harness(): Harness {
  const started: { text: string; voiceId: string | null }[] = [];
  const pending: (() => void)[] = [];
  let stops = 0;
  const deps: UtteranceCoordinatorDeps = {
    speak: (text, voiceId, onSettled) => {
      started.push({ text, voiceId });
      pending.push(onSettled);
    },
    stop: () => {
      stops += 1;
    },
  };
  return {
    coordinator: createUtteranceCoordinator(deps),
    started,
    stopCount: () => stops,
    settle: (index) => pending[index]?.(),
  };
}

describe("utterance coordinator", () => {
  it("interrupts the current utterance instead of dropping the new reply", () => {
    const h = harness();

    h.coordinator.speak("first", null);
    h.coordinator.speak("second", "voice-1");

    expect(h.started.map((item) => item.text)).toEqual(["first", "second"]);
    expect(h.started[1]?.voiceId).toBe("voice-1");
    expect(h.stopCount()).toBe(1);
  });

  it("keeps the new utterance in progress when the interrupted one settles late", () => {
    const h = harness();

    h.coordinator.speak("first", null);
    h.coordinator.speak("second", null);
    // The platform reports the interruption only after the replacement already started.
    h.settle(0);

    expect(h.coordinator.isSpeaking()).toBe(true);

    h.settle(1);
    expect(h.coordinator.isSpeaking()).toBe(false);
  });

  it("settles normally when nothing was interrupted", () => {
    const h = harness();

    h.coordinator.speak("only", null);
    h.settle(0);

    expect(h.coordinator.isSpeaking()).toBe(false);
  });

  it("does not interrupt when nothing is being read", () => {
    const h = harness();

    h.coordinator.speak("first", null);
    h.settle(0);
    h.coordinator.speak("second", null);

    expect(h.stopCount()).toBe(0);
  });

  it("stop silences an in-progress utterance and ignores its late settlement", () => {
    const h = harness();

    h.coordinator.speak("first", null);
    h.coordinator.stop();

    expect(h.stopCount()).toBe(1);
    expect(h.coordinator.isSpeaking()).toBe(false);

    h.settle(0);
    expect(h.coordinator.isSpeaking()).toBe(false);
  });

  it("ignores empty text", () => {
    const h = harness();

    h.coordinator.speak("", null);

    expect(h.started).toEqual([]);
    expect(h.coordinator.isSpeaking()).toBe(false);
  });
});
