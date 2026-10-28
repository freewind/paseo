import { describe, expect, it } from "vitest";

import {
  buildLineDiff,
  parseUnifiedDiff,
  extractTaskEntriesFromToolCall,
} from "./tool-call-parsers";

describe("tool-call-parsers", () => {
  it("builds line diff without highlighting the common suffix", () => {
    expect(buildLineDiff("const value = 1;\nline", "const value = 2;\nline")).toEqual([
      {
        type: "remove",
        content: "-const value = 1;",
        segments: [
          { text: "const value = ", changed: false },
          { text: "1", changed: true },
          { text: ";", changed: false },
        ],
      },
      {
        type: "add",
        content: "+const value = 2;",
        segments: [
          { text: "const value = ", changed: false },
          { text: "2", changed: true },
          { text: ";", changed: false },
        ],
      },
      { type: "context", content: " line" },
    ]);
  });

  it("parses unified diff", () => {
    const parsed = parseUnifiedDiff("@@\n-old\n+new\n");

    expect(parsed.find((entry) => entry.type === "remove")?.content).toBe("-old");
    expect(parsed.find((entry) => entry.type === "add")?.content).toBe("+new");
  });

  it("extracts TodoWrite task entries", () => {
    const tasks = extractTaskEntriesFromToolCall("TodoWrite", {
      todos: [
        { content: "Task 1", status: "pending" },
        { content: "Task 2", status: "completed" },
      ],
    });

    expect(tasks?.map((task) => task.text)).toEqual(["Task 1", "Task 2"]);
    expect(tasks?.map((task) => task.completed)).toEqual([false, true]);
  });
});
