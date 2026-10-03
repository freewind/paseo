import { describe, expect, test } from "vitest";

import { mapToolDetail, parseToolArgs, parseToolResult } from "./tool-call-mapper.js";

describe("Pi tool call mapper", () => {
  test("maps bash args and result to shell detail", () => {
    const toolCall = parseToolArgs("bash", { command: "echo hello" });
    const result = parseToolResult({ output: "hello\n", exitCode: 0 });

    expect(mapToolDetail(toolCall, result)).toEqual({
      type: "shell",
      command: "echo hello",
      output: "hello\n",
      exitCode: 0,
    });
  });

  test("maps legacy edit args to edit detail with diff", () => {
    const toolCall = parseToolArgs("edit", {
      path: "app.ts",
      old_string: "before",
      new_string: "after",
    });
    const result = parseToolResult({ details: { diff: "-before\n+after" } });

    expect(mapToolDetail(toolCall, result)).toEqual({
      type: "edit",
      filePath: "app.ts",
      oldString: "before",
      newString: "after",
      unifiedDiff: "-before\n+after",
    });
  });

  test("preserves ordinary writes as write details", () => {
    const toolCall = parseToolArgs("write", {
      path: "notes.txt",
      content: "unchanged\n",
    });

    expect(mapToolDetail(toolCall, parseToolResult({ text: "Wrote notes.txt" }))).toEqual({
      type: "write",
      filePath: "notes.txt",
      content: "unchanged\n",
    });
  });

  test("maps executed xdev writes to their wrapped tool detail", () => {
    const toolCall = parseToolArgs("write", {
      path: "xd://browser",
      content: "{}",
    });
    const result = parseToolResult({
      content: [{ type: "text", text: "Opened Example Domain" }],
      details: {
        xdev: {
          tool: "browser",
          mode: "execute",
          args: { action: "open", url: "https://example.com" },
          inner: { title: "Example Domain" },
        },
      },
    });

    expect(mapToolDetail(toolCall, result)).toEqual({
      type: "unknown",
      input: { action: "open", url: "https://example.com" },
      output: {
        content: [{ type: "text", text: "Opened Example Domain" }],
        details: { title: "Example Domain" },
      },
    });
    expect(resolveToolCallName(toolCall, result)).toBe("browser");
  });

  test("does not treat xdev help metadata as an executed inner tool", () => {
    const toolCall = parseToolArgs("write", {
      path: "xd://browser",
      content: "",
    });
    const result = parseToolResult({
      details: {
        xdev: {
          tool: "browser",
          mode: "help",
          inner: "Browser help",
        },
      },
    });

    expect(mapToolDetail(toolCall, result)).toEqual({
      type: "unknown",
      input: { path: "xd://browser", content: "" },
      output: result,
    });
    expect(resolveToolCallName(toolCall, result)).toBe("write");
  });

  test("does not treat malformed xdev metadata as an executed inner tool", () => {
    const toolCall = parseToolArgs("write", {
      path: "xd://browser",
      content: "{}",
    });
    const result = parseToolResult({
      details: {
        xdev: {
          tool: "",
          mode: "execute",
          args: { action: "open" },
          inner: { title: "must not surface" },
        },
      },
    });

    expect(mapToolDetail(toolCall, result)).toEqual({
      type: "unknown",
      input: { path: "xd://browser", content: "{}" },
      output: result,
    });
    expect(resolveToolCallName(toolCall, result)).toBe("write");
  });

  test("keeps the find, grep and ls parameters in search details", () => {
    expect(
      mapToolDetail(parseToolArgs("find", { pattern: "*.tsx", path: "src", limit: 20 })),
    ).toEqual({
      type: "search",
      query: "*.tsx",
      toolName: "search",
      path: "src",
      limit: 20,
      content: undefined,
    });
    expect(
      mapToolDetail(
        parseToolArgs("grep", {
          pattern: "buildDetailSections",
          path: "src",
          glob: "*.ts",
          limit: 30,
        }),
      ),
    ).toEqual({
      type: "search",
      query: "buildDetailSections",
      toolName: "grep",
      path: "src",
      glob: "*.ts",
      limit: 30,
      content: undefined,
    });
    expect(mapToolDetail(parseToolArgs("ls", { path: "src/terminal", limit: 5 }))).toEqual({
      type: "search",
      query: "src/terminal",
      path: "src/terminal",
      limit: 5,
      content: undefined,
    });
  });
  test("preserves unknown tool input and parsed output", () => {
    const toolCall = parseToolArgs("custom_tool", { value: 42 });
    const result = parseToolResult({ text: "custom result" });

    expect(mapToolDetail(toolCall, result)).toEqual({
      type: "unknown",
      input: { value: 42 },
      output: { text: "custom result" },
    });
  });
});
