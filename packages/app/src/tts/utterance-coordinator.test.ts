import { describe, expect, it } from "vitest";
import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { createAssistantSpeechSender } from "./assistant-message-completion";
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

describe("live assistant speech", () => {
  it("reads completed progress before the turn ends without restarting for deltas or empty replies", () => {
    const h = harness();
    const sender = createAssistantSpeechSender();
    const consume = (text: string, messageId: string, complete = false) => {
      const event: AgentStreamEventPayload = {
        type: "timeline",
        provider: "omp",
        turnId: "turn-1",
        item: { type: "assistant_message", text, messageId },
        ...(complete ? { assistantMessageComplete: true as const } : {}),
      };
      const content = sender.consume("agent-1", event);
      if (content) h.coordinator.speak(content, null);
    };
    consume("正在", "progress");
    consume("检查", "progress");
    expect(h.started).toEqual([]);
    consume("", "progress", true);
    expect(h.started).toEqual([{ text: "正在检查", voiceId: null }]);
    consume("", "progress", true);
    sender.consume("agent-1", { type: "turn_started", provider: "omp", turnId: "turn-2" });
    consume("![图片](image.png)  ", "empty");
    consume("", "empty", true);
    expect(h.stopCount()).toBe(0);
    expect(h.coordinator.isSpeaking()).toBe(true);
    consume("检查完成", "result");
    consume("", "result", true);
    expect(h.stopCount()).toBe(1);
    expect(h.started.map((read) => read.text)).toEqual(["正在检查", "检查完成"]);
    sender.consume("agent-1", { type: "turn_completed", provider: "omp", turnId: "turn-1" });
    expect(h.started.map((read) => read.text)).toEqual(["正在检查", "检查完成"]);
  });

  it("keeps agents and turns isolated and permits consecutive messages without native IDs", () => {
    const sender = createAssistantSpeechSender();
    const chunk = (text: string, turnId = "turn-1", complete = false): AgentStreamEventPayload => ({
      type: "timeline",
      provider: "claude",
      turnId,
      item: { type: "assistant_message", text },
      ...(complete ? { assistantMessageComplete: true as const } : {}),
    });
    sender.consume("a", chunk("第一段"));
    sender.consume("b", chunk("后台回复"));
    expect(sender.consume("a", chunk("", "turn-2", true))).toBeNull();
    expect(sender.consume("a", chunk("", "turn-1", true))).toBe("第一段");
    sender.consume("a", chunk("第二段"));
    expect(sender.consume("a", chunk("", "turn-1", true))).toBe("第二段");
    expect(sender.consume("b", chunk("", "turn-1", true))).toBe("后台回复");
  });
});

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
