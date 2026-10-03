import { describe, expect, it } from "vitest";

import {
  buildLineDiff,
  parseUnifiedDiff,
  extractTaskEntriesFromToolCall,
} from "./tool-call-parsers";

describe("tool-call-parsers", () => {
  it("builds line diff for text changes", () => {
    const diff = buildLineDiff("old\nline\n", "new\nline\n");

    expect(diff.some((entry) => entry.type === "remove")).toBe(true);
    expect(diff.some((entry) => entry.type === "add")).toBe(true);
  });

  it("parses unified diff", () => {
    const parsed = parseUnifiedDiff("@@\n-old\n+new\n");

    expect(parsed.find((entry) => entry.type === "remove")?.content).toBe("-old");
    expect(parsed.find((entry) => entry.type === "add")?.content).toBe("+new");
  });

  it("parseUnifiedDiff attaches word-level segments for adjacent remove/add pairs", () => {
    const parsed = parseUnifiedDiff("@@\n-const a = 1;\n+const a = 2;\n");

    const remove = parsed.find((entry) => entry.type === "remove");
    const add = parsed.find((entry) => entry.type === "add");

    expect(remove?.segments).toBeDefined();
    expect(add?.segments).toBeDefined();

    const removeChanged = remove?.segments?.filter((s) => s.changed).map((s) => s.text);
    const addChanged = add?.segments?.filter((s) => s.changed).map((s) => s.text);

    expect(removeChanged).toEqual(["1"]);
    expect(addChanged).toEqual(["2"]);
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
