import { describe, expect, it } from "vitest";
import { isConversationSpeechEnabled } from "./conversation-speech";

const key = JSON.stringify(["server-a", "agent-1"]);

function settings(overrides: { ttsEnabled: boolean; ttsConversations?: Record<string, boolean> }) {
  return { ttsEnabled: overrides.ttsEnabled, ttsConversations: overrides.ttsConversations ?? {} };
}

describe("isConversationSpeechEnabled", () => {
  it("stays off when the global switch is off", () => {
    expect(
      isConversationSpeechEnabled(settings({ ttsEnabled: false }), "server-a", "agent-1"),
    ).toBe(false);
  });

  it("defaults to on for a new conversation while the global switch is on", () => {
    expect(isConversationSpeechEnabled(settings({ ttsEnabled: true }), "server-a", "agent-1")).toBe(
      true,
    );
  });

  it("keeps an explicit opt-out silent", () => {
    expect(
      isConversationSpeechEnabled(
        settings({ ttsEnabled: true, ttsConversations: { [key]: false } }),
        "server-a",
        "agent-1",
      ),
    ).toBe(false);
  });

  it("honors an explicit opt-in", () => {
    expect(
      isConversationSpeechEnabled(
        settings({ ttsEnabled: true, ttsConversations: { [key]: true } }),
        "server-a",
        "agent-1",
      ),
    ).toBe(true);
  });

  it("does not leak another conversation's opt-out", () => {
    expect(
      isConversationSpeechEnabled(
        settings({
          ttsEnabled: true,
          ttsConversations: { [JSON.stringify(["server-a", "agent-2"])]: false },
        }),
        "server-a",
        "agent-1",
      ),
    ).toBe(true);
  });
});
