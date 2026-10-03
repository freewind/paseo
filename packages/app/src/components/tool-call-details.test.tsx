/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";

vi.mock("@/constants/platform", () => ({
  isWeb: true,
  isNative: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolCallDetails.input": "Input",
        "toolCallDetails.empty": "No additional details available",
      })[key] ?? key,
  }),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { ToolCallDetailsContent } from "./tool-call-details";

// Hoisted so JSX props stay referentially stable (react-perf lint rule).
const READ_WITHOUT_CONTENT: ToolCallDetail = {
  type: "read",
  filePath: "/repo/packages/app/src/index.ts",
  offset: 40,
  limit: 20,
};
const READ_WITH_CONTENT: ToolCallDetail = {
  type: "read",
  filePath: "/repo/notes.md",
  content: "alpha\nbeta",
};
const GREP_WITH_PARAMS: ToolCallDetail = {
  type: "search",
  query: "buildDetailSections",
  toolName: "grep",
  path: "packages/app/src",
  glob: "*.tsx",
  limit: 50,
  content: "src/components/tool-call-details.tsx:668",
};
const WRITE_DETAIL: ToolCallDetail = {
  type: "write",
  filePath: "/repo/created.txt",
  content: "hello",
};
const EDIT_DETAIL: ToolCallDetail = {
  type: "edit",
  filePath: "/repo/edited.txt",
  newString: "gamma",
  oldString: "beta",
};
const SHELL_DETAIL: ToolCallDetail = { type: "shell", command: "pwd", output: "/repo" };

describe("ToolCallDetailsContent parameters", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  function renderDetail(toolName: string, detail: ToolCallDetail) {
    act(() => {
      root?.render(<ToolCallDetailsContent toolName={toolName} detail={detail} />);
    });
    return container?.textContent ?? "";
  }

  it("shows read parameters when the tool returned no content", () => {
    const text = renderDetail("read", READ_WITHOUT_CONTENT);

    expect(text).toContain("Input");
    expect(text).toContain("/repo/packages/app/src/index.ts");
    expect(text).toContain("offset");
    expect(text).toContain("40");
    expect(text).toContain("limit");
    expect(text).toContain("20");
    expect(text).not.toContain("No additional details available");
  });

  it("shows read parameters above the returned content", () => {
    const text = renderDetail("read", READ_WITH_CONTENT);

    expect(text).toContain("/repo/notes.md");
    expect(text).toContain("alpha");
    expect(text.indexOf("/repo/notes.md")).toBeLessThan(text.indexOf("alpha"));
  });

  it("shows search parameters, including the path, glob and limit the daemon sends", () => {
    const text = renderDetail("grep", GREP_WITH_PARAMS);

    expect(text).toContain("query");
    expect(text).toContain("buildDetailSections");
    expect(text).toContain("packages/app/src");
    expect(text).toContain("*.tsx");
    expect(text).toContain("50");
    expect(text.indexOf("buildDetailSections")).toBeLessThan(
      text.indexOf("src/components/tool-call-details.tsx:668"),
    );
  });

  it("shows the edited file path for edit and write details", () => {
    expect(renderDetail("write", WRITE_DETAIL)).toContain("/repo/created.txt");
    expect(renderDetail("edit", EDIT_DETAIL)).toContain("/repo/edited.txt");
  });

  it("leaves shell details without a parameter block", () => {
    const text = renderDetail("bash", SHELL_DETAIL);

    expect(text).toContain("pwd");
    expect(text).not.toContain("Input");
  });
});
