import { describe, expect, test } from "vitest";
import { computeHistoryStats } from "./history-stats.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

describe("computeHistoryStats", () => {
  test("counts every user message and keeps the last one", () => {
    const items: AgentTimelineItem[] = [
      { type: "user_message", text: "first" },
      { type: "assistant_message", text: "reply" },
      { type: "user_message", text: "second" },
    ];

    expect(computeHistoryStats(items)).toEqual({
      userMessageCount: 2,
      lastUserMessage: "second",
    });
  });

  test("ignores everything that is not a user message", () => {
    const items: AgentTimelineItem[] = [
      { type: "assistant_message", text: "reply" },
      { type: "reasoning", text: "thinking" },
      { type: "error", message: "boom" },
    ];

    expect(computeHistoryStats(items)).toEqual({
      userMessageCount: 0,
      lastUserMessage: null,
    });
  });

  test("returns the last message untruncated", () => {
    const long = "x".repeat(4000);

    expect(computeHistoryStats([{ type: "user_message", text: long }]).lastUserMessage).toBe(long);
  });
});
