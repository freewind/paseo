import { describe, expect, it } from "vitest";

import { buildToolCallDisplayModel } from "./tool-call-display";

describe("tool-call-display", () => {
  it("builds display model from canonical shell detail", () => {
    const display = buildToolCallDisplayModel({
      name: "shell",
      status: "running",
      error: null,
      detail: {
        type: "shell",
        command: "npm test",
      },
    });

    expect(display).toEqual({
      displayName: "Shell",
      summary: "npm test",
    });
  });

  it("builds display model from canonical read detail", () => {
    const display = buildToolCallDisplayModel({
      name: "read_file",
      status: "completed",
      error: null,
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
      },
      cwd: "/tmp/repo",
    });

    expect(display).toEqual({
      displayName: "Read",
      summary: "src/index.ts",
    });
  });

  it("uses sub-agent detail for task label and description", () => {
    const display = buildToolCallDisplayModel({
      name: "task",
      status: "running",
      error: null,
      detail: {
        type: "sub_agent",
        subAgentType: "Explore",
        description: "Inspect repository structure",
        log: "[Read] README.md",
      },
    });

    expect(display).toEqual({
      displayName: "Explore",
      summary: "Inspect repository structure",
    });
  });

  it("falls back to humanized tool name for unknown tools", () => {
    const display = buildToolCallDisplayModel({
      name: "custom_tool_name",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: null,
        output: null,
      },
    });

    expect(display).toEqual({
      displayName: "Custom tool name",
    });
  });

  it("builds display model from worktree setup detail", () => {
    const display = buildToolCallDisplayModel({
      name: "paseo_worktree_setup",
      status: "running",
      error: null,
      detail: {
        type: "worktree_setup",
        worktreePath: "/tmp/repo/.paseo/worktrees/repo/branch",
        branchName: "feature-branch",
        log: "==> [1/1] Running: npm install\n",
        commands: [
          {
            index: 1,
            command: "npm install",
            cwd: "/tmp/repo/.paseo/worktrees/repo/branch",
            log: "",
            status: "running",
            exitCode: null,
          },
        ],
      },
    });

    expect(display).toEqual({
      displayName: "Worktree setup",
      summary: "feature-branch",
    });
  });

  it("does not derive command summary from unknown raw detail", () => {
    const display = buildToolCallDisplayModel({
      name: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: { command: "npm run test" },
        output: null,
      },
    });

    expect(display).toEqual({
      displayName: "Exec command",
    });
  });

  it("returns formatted errorText from the same display pipeline", () => {
    const display = buildToolCallDisplayModel({
      name: "shell",
      status: "failed",
      error: { message: "boom" },
      detail: {
        type: "unknown",
        input: { command: "false" },
        output: null,
      },
    });

    expect(display.errorText).toBe('{\n  "message": "boom"\n}');
  });

  it("shows terminal interaction with only the fixed label when no command is available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
    });
  });

  it("shows terminal interaction command as the summary when available", () => {
    const display = buildToolCallDisplayModel({
      name: "terminal",
      status: "completed",
      error: null,
      detail: {
        type: "plain_text",
        label: "npm run test",
        icon: "square_terminal",
      },
    });

    expect(display).toEqual({
      displayName: "Terminal",
      summary: "npm run test",
    });
  });

  it("summarizes an unmapped MCP search with its query and its path", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__fsearch__grep",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: { query: "agentMemos.", regex: true, path: "packages/protocol" },
        output: null,
      },
    });

    expect(display.summary).toBe("agentMemos. · packages/protocol");
  });

  it("keeps the query alone when the call names no path", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__codegraph__codegraph_explore",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: { query: "tool call header" },
        output: null,
      },
    });

    expect(display.summary).toBe("tool call header");
  });

  it("reads the symbol and file fields of an unmapped code tool", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__serena__find_symbol",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: { name_path_pattern: "Foo/bar", relative_path: "src/x.ts" },
        output: null,
      },
    });

    expect(display.summary).toBe("Foo/bar · src/x.ts");
  });

  it("joins a pattern list and folds a multi-line prompt onto one line", () => {
    const patterns = buildToolCallDisplayModel({
      name: "mcp__fsearch__multi_grep",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: { patterns: ["PrepareUpload", "prepare_upload", "uploadPrepare"] },
        output: null,
      },
    });
    const prompt = buildToolCallDisplayModel({
      name: "mcp__paseo__send_agent_prompt",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: { agentId: "a-1", prompt: "fix the badge\n\nthen run the tests" },
        output: null,
      },
    });

    expect(patterns.summary).toBe("PrepareUpload | prepare_upload | …");
    expect(prompt.summary).toBe("fix the badge then run the tests");
  });

  it("keeps the summary to two parts when many candidate keys match", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__serena__replace_symbol_body",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: {
          query: "first matching query",
          pattern: "Foo",
          name_path_pattern: "Foo/bar",
          name_path: "Foo/baz",
          path: "src/a.ts",
          relative_path: "src/b.ts",
          projectPath: "/tmp/repo",
        },
        output: null,
      },
    });

    expect(display.summary).toBe("first matching query · src/a.ts");
  });

  it("keeps a path summary for an unmapped tool that names only a file", () => {
    const display = buildToolCallDisplayModel({
      name: "mcp__other__stat",
      status: "completed",
      error: null,
      detail: {
        type: "unknown",
        input: { path: "/tmp/repo/src/index.ts", limit: 5 },
        output: null,
      },
      cwd: "/tmp/repo",
    });

    expect(display.summary).toBe("src/index.ts");
  });
});
