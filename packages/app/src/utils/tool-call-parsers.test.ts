import { describe, expect, it } from "vitest";

import {
  buildLineDiff,
  parseUnifiedDiff,
  extractTaskEntriesFromToolCall,
  type DiffLine,
} from "./tool-call-parsers";

function segmentText(line: DiffLine, changed: boolean): string {
  return (line.segments ?? [])
    .filter((part) => part.changed === changed)
    .map((part) => part.text)
    .join("");
}

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

  it("does not highlight a shared prefix when several removed rows become one", () => {
    const prefix = '<Button variant="ghost" ... data-component-mark={525}';
    const parsed = parseUnifiedDiff(
      ["@@", `-${prefix}>`, '-{""}', "-    size={size}", `+${prefix} size={size}>`].join("\n"),
    );
    expect(parsed.slice(1).map((line) => line.segments)).toEqual([
      [
        { text: prefix, changed: false },
        { text: ">", changed: true },
      ],
      [{ text: '{""}', changed: true }],
      [
        { text: "    ", changed: true },
        { text: "size={size}", changed: false },
      ],
      [
        { text: prefix, changed: false },
        { text: " ", changed: true },
        { text: "size={size}", changed: false },
        { text: ">", changed: true },
      ],
    ]);
  });

  it("keeps words and delimiters unmarked when one row is split", () => {
    const diff = buildLineDiff(
      "const value = call(first, second);",
      "const value = call(\n  first,\n  second\n);",
    );
    expect(diff.map((line) => segmentText(line, true))).toEqual([" ", "", "  ", "  ", ""]);
    expect(
      diff.filter((line) => line.type === "add").map((line) => segmentText(line, false)),
    ).toEqual(["const value = call(", "first,", "second", ");"]);
  });

  it("marks each replacement in a multi-row change block", () => {
    const parsed = parseUnifiedDiff(
      ["@@", "-const a = 1;", "-const b = 2;", "+const a = 3;", "+const b = 4;"].join("\n"),
    );
    expect(parsed.slice(1).map((line) => segmentText(line, true))).toEqual(["1", "2", "3", "4"]);
  });

  it("does not borrow matches from a different hunk or across context", () => {
    const parsed = parseUnifiedDiff(
      ["@@", "-alpha", "+beta", " separator", "-beta", "+gamma", "@@", "-gamma", "+alpha"].join(
        "\n",
      ),
    );
    expect(
      parsed
        .filter((line) => line.type === "add" || line.type === "remove")
        .map((line) => line.segments),
    ).toEqual([
      [{ text: "alpha", changed: true }],
      [{ text: "beta", changed: true }],
      [{ text: "beta", changed: true }],
      [{ text: "gamma", changed: true }],
      [{ text: "gamma", changed: true }],
      [{ text: "alpha", changed: true }],
    ]);
  });

  it("keeps empty removed rows from shifting later highlight offsets", () => {
    const parsed = parseUnifiedDiff("@@\n-alpha\n-\n-beta\n+alpha beta");
    expect(parsed.slice(1).map((line) => line.segments)).toEqual([
      [{ text: "alpha", changed: false }],
      [],
      [{ text: "beta", changed: false }],
      [
        { text: "alpha", changed: false },
        { text: " ", changed: true },
        { text: "beta", changed: false },
      ],
    ]);
  });

  it("marks changed punctuation without including its unchanged neighbors", () => {
    const parsed = parseUnifiedDiff("@@\n-return foo(a);\n+return foo[a];");
    expect(parsed.slice(1).map((line) => line.segments)).toEqual([
      [
        { text: "return foo", changed: false },
        { text: "(", changed: true },
        { text: "a", changed: false },
        { text: ")", changed: true },
        { text: ";", changed: false },
      ],
      [
        { text: "return foo", changed: false },
        { text: "[", changed: true },
        { text: "a", changed: false },
        { text: "]", changed: true },
        { text: ";", changed: false },
      ],
    ]);
  });

  it("keeps Chinese identifiers and astral characters intact", () => {
    const parsed = parseUnifiedDiff('@@\n-const 中文 = "😀";\n+const 中文 = "😃";');
    expect(parsed.slice(1).map((line) => line.segments)).toEqual([
      [
        { text: 'const 中文 = "', changed: false },
        { text: "😀", changed: true },
        { text: '";', changed: false },
      ],
      [
        { text: 'const 中文 = "', changed: false },
        { text: "😃", changed: true },
        { text: '";', changed: false },
      ],
    ]);
  });

  it("uses only whole-line coloring for additions or removals without a counterpart", () => {
    expect(parseUnifiedDiff("@@\n+new\n context\n-old")).toEqual([
      { type: "header", content: "@@" },
      { type: "add", content: "+new" },
      { type: "context", content: " context" },
      { type: "remove", content: "-old" },
    ]);
  });

  it("keeps large replacements readable without a quadratic inline comparison", () => {
    const oldText = Array.from({ length: 600 }, (_, index) => `old${index}`).join(" ");
    const newText = Array.from({ length: 600 }, (_, index) => `new${index}`).join(" ");
    expect(parseUnifiedDiff(`@@\n-${oldText}\n+${newText}`)).toEqual([
      { type: "header", content: "@@" },
      { type: "remove", content: `-${oldText}` },
      { type: "add", content: `+${newText}` },
    ]);
  });

  it("still highlights a small edit with a large shared prefix and suffix", () => {
    const common = Array.from({ length: 600 }, (_, index) => `item${index}`).join(" ");
    const parsed = parseUnifiedDiff(`@@\n-${common} old ${common}\n+${common} new ${common}`);
    expect(parsed.slice(1).map((line) => line.segments)).toEqual([
      [
        { text: `${common} `, changed: false },
        { text: "old", changed: true },
        { text: ` ${common}`, changed: false },
      ],
      [
        { text: `${common} `, changed: false },
        { text: "new", changed: true },
        { text: ` ${common}`, changed: false },
      ],
    ]);
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
