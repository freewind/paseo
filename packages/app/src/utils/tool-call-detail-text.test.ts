import { describe, expect, it } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { buildToolCallDetailText } from "./tool-call-detail-text";

describe("buildToolCallDetailText", () => {
  it("copies the shell command and its output", () => {
    expect(
      buildToolCallDetailText({
        type: "shell",
        command: "pnpm test",
        cwd: "/repo",
        output: "2 passed",
      }),
    ).toBe("Input:\ncommand: pnpm test\ncwd: /repo\n\nOutput:\n2 passed");
  });

  it("keeps read parameters when the tool returned no content", () => {
    expect(
      buildToolCallDetailText({
        type: "read",
        filePath: "/repo/app.ts",
        offset: 20,
        limit: 10,
      }),
    ).toBe("Input:\npath: /repo/app.ts\noffset: 20\nlimit: 10");
  });

  it("separates read parameters from the returned content", () => {
    expect(
      buildToolCallDetailText({
        type: "read",
        filePath: "/repo/app.ts",
        content: "const a = 1;",
      }),
    ).toBe("Input:\npath: /repo/app.ts\n\nOutput:\nconst a = 1;");
  });

  it("copies the file path and diff for an edit", () => {
    expect(
      buildToolCallDetailText({
        type: "edit",
        filePath: "/repo/app.ts",
        oldString: "const a = 1;",
        newString: "const a = 2;",
      }),
    ).toBe("Input:\npath: /repo/app.ts\n\nOutput:\n-const a = 1;\n+const a = 2;");
  });

  it("prefers the unified diff when the daemon supplied one", () => {
    expect(
      buildToolCallDetailText({
        type: "edit",
        filePath: "/repo/app.ts",
        unifiedDiff: "@@ -1 +1 @@\n-const a = 1;\n+const a = 2;",
      }),
    ).toContain("Output:\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;");
  });

  it("copies search parameters and every result block", () => {
    const detail: ToolCallDetail = {
      type: "search",
      query: "buildDetailSections",
      toolName: "grep",
      path: "packages/app/src",
      glob: "*.tsx",
      limit: 50,
      content: "tool-call-details.tsx:668",
      filePaths: ["tool-call-details.tsx"],
    };

    expect(buildToolCallDetailText(detail)).toBe(
      [
        "Input:",
        "query: buildDetailSections",
        "path: packages/app/src",
        "glob: *.tsx",
        "limit: 50",
        "",
        "Output:",
        "tool-call-details.tsx:668",
        "",
        "tool-call-details.tsx",
      ].join("\n"),
    );
  });

  it("serializes unknown tool input and output as JSON", () => {
    expect(
      buildToolCallDetailText({
        type: "unknown",
        input: { op: "hover" },
        output: { contents: "hover text" },
      }),
    ).toBe('Input:\n{\n  "op": "hover"\n}\n\nOutput:\n{\n  "contents": "hover text"\n}');
  });

  it("returns an empty string when there is nothing to copy", () => {
    expect(buildToolCallDetailText(undefined)).toBe("");
    expect(buildToolCallDetailText({ type: "read", filePath: "" })).toBe("");
  });
});
