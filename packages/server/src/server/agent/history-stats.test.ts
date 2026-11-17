import { describe, expect, test } from "vitest";
import { RECENT_USER_MESSAGE_LIMIT, computeHistoryStats } from "./history-stats.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

describe("computeHistoryStats", () => {
  test("counts every user message and keeps the recent ones oldest first", () => {
    const items: AgentTimelineItem[] = [
      { type: "user_message", text: "first" },
      { type: "assistant_message", text: "reply" },
      { type: "user_message", text: "second" },
    ];

    expect(computeHistoryStats(items)).toEqual({
      userMessageCount: 2,
      recentUserMessages: ["first", "second"],
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
      recentUserMessages: [],
    });
  });

  test("keeps the newest entries untruncated and drops what fell out of the window", () => {
    const long = "x".repeat(4000);
    const items: AgentTimelineItem[] = [
      ...Array.from({ length: RECENT_USER_MESSAGE_LIMIT }, (_, index) => ({
        type: "user_message" as const,
        text: `older-${index}`,
      })),
      { type: "user_message", text: long },
    ];

    const stats = computeHistoryStats(items);
    expect(stats.userMessageCount).toBe(RECENT_USER_MESSAGE_LIMIT + 1);
    expect(stats.recentUserMessages).toHaveLength(RECENT_USER_MESSAGE_LIMIT);
    expect(stats.recentUserMessages[0]).toBe("older-1");
    expect(stats.recentUserMessages.at(-1)).toBe(long);
  });
});
