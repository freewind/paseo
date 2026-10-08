import { describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceDesktopTabActions,
  buildWorkspaceTabMenuEntries,
} from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

function itemKeys(entries: WorkspaceTabMenuEntry[]): string[] {
  return entries.filter((entry) => entry.kind === "item").map((entry) => entry.key);
}

function createAgentTab(): WorkspaceTabDescriptor {
  return {
    key: "agent_123",
    tabId: "agent_123",
    kind: "agent",
    target: { kind: "agent", agentId: "agent-123" },
  };
}

describe("buildWorkspaceTabMenuEntries", () => {
  it("omits agent copy actions and rename for draft tabs", () => {
    const entries = buildWorkspaceTabMenuEntries({
      surface: "mobile",
      tab: {
        key: "draft_123",
        tabId: "draft_123",
        kind: "draft",
        target: { kind: "draft", draftId: "draft_123" },
      },
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-menu-draft_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });

    expect(itemKeys(entries)).not.toContain("copy-resume-command");
    expect(itemKeys(entries)).not.toContain("copy-agent-id");
    expect(itemKeys(entries)).not.toContain("reload-agent");
    expect(itemKeys(entries)).not.toContain("hide-agent");
    expect(itemKeys(entries)).not.toContain("rename");
    expect(entries.some((entry) => entry.kind === "separator")).toBe(false);
  });

  it("invokes onRenameTab when the rename entry is selected for agent tabs", () => {
    const onRenameTab = vi.fn();
    const tab = createAgentTab();
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab,
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-agent_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab,
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });

    const renameEntry = entries.find((entry) => entry.kind === "item" && entry.key === "rename");
    if (!renameEntry || renameEntry.kind !== "item") {
      throw new Error("Rename entry missing");
    }
    renameEntry.onSelect();

    expect(onRenameTab).toHaveBeenCalledWith(tab);
  });

  it("copies the conversation as Markdown for agent tabs and only agent tabs", () => {
    const onCopyConversationMarkdown = vi.fn();
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: createAgentTab(),
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-agent_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown,
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });

    const entry = entries.find(
      (candidate) => candidate.kind === "item" && candidate.key === "copy-conversation-markdown",
    );
    if (!entry || entry.kind !== "item") {
      throw new Error("Copy conversation entry missing");
    }
    expect(entry.testID).toBe("workspace-tab-context-agent_123-copy-conversation-markdown");
    entry.onSelect();
    expect(onCopyConversationMarkdown).toHaveBeenCalledWith("agent-123");

    const terminalEntries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: {
        key: "terminal_abc",
        tabId: "terminal_abc",
        kind: "terminal",
        target: { kind: "terminal", terminalId: "terminal-abc" },
      },
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-terminal_abc",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown,
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });
    expect(itemKeys(terminalEntries)).not.toContain("copy-conversation-markdown");
  });

  it("includes copy id and rename for terminal tabs", () => {
    const onRenameTab = vi.fn();
    const onCopyTerminalId = vi.fn();
    const terminalTab: WorkspaceTabDescriptor = {
      key: "terminal_abc",
      tabId: "terminal_abc",
      kind: "terminal",
      target: { kind: "terminal", terminalId: "terminal-abc" },
    };
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: terminalTab,
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-terminal_abc",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId,
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab,
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });

    expect(itemKeys(entries).slice(0, 2)).toEqual(["copy-terminal-id", "rename"]);
    expect(itemKeys(entries)).not.toContain("copy-resume-command");
    expect(itemKeys(entries)).not.toContain("copy-agent-id");
    expect(itemKeys(entries)).not.toContain("copy-file-path");
    expect(itemKeys(entries)).not.toContain("reload-agent");
    expect(itemKeys(entries)).not.toContain("hide-agent");

    const copyTerminalIdEntry = entries.find(
      (entry) => entry.kind === "item" && entry.key === "copy-terminal-id",
    );
    if (!copyTerminalIdEntry || copyTerminalIdEntry.kind !== "item") {
      throw new Error("Copy terminal id entry missing");
    }
    copyTerminalIdEntry.onSelect();
    expect(onCopyTerminalId).toHaveBeenCalledWith("terminal-abc");

    const renameEntry = entries.find((entry) => entry.kind === "item" && entry.key === "rename");
    if (!renameEntry || renameEntry.kind !== "item") {
      throw new Error("Rename entry missing");
    }
    renameEntry.onSelect();
    expect(onRenameTab).toHaveBeenCalledWith(terminalTab);
  });

  it("includes copy file path for file tabs", () => {
    const onCopyFilePath = vi.fn();
    const fileTab: WorkspaceTabDescriptor = {
      key: "file_abc",
      tabId: "file_abc",
      kind: "file",
      target: { kind: "file", path: "/some/path.ts", lineStart: 1, lineEnd: 10 },
    };
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: fileTab,
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-file_abc",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId: vi.fn(),
      onCopyFilePath,
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });

    expect(itemKeys(entries)[0]).toBe("copy-file-path");
    expect(itemKeys(entries)).not.toContain("copy-resume-command");
    expect(itemKeys(entries)).not.toContain("copy-agent-id");
    expect(itemKeys(entries)).not.toContain("rename");
    expect(itemKeys(entries)).not.toContain("reload-agent");
    expect(itemKeys(entries)).not.toContain("hide-agent");

    const copyFilePathEntry = entries.find(
      (entry) => entry.kind === "item" && entry.key === "copy-file-path",
    );
    if (!copyFilePathEntry || copyFilePathEntry.kind !== "item") {
      throw new Error("Copy file path entry missing");
    }
    copyFilePathEntry.onSelect();
    expect(onCopyFilePath).toHaveBeenCalledWith("/some/path.ts");
  });

  it("uses a Changes close id for the working diff tab", () => {
    const actions = buildWorkspaceDesktopTabActions({
      tab: {
        key: "working_diff_abc",
        tabId: "working_diff_abc",
        kind: "working_diff",
        target: {
          kind: "working_diff",
          focusPath: "src/example.ts",
          focusRequestId: 1,
        },
      },
      index: 0,
      tabCount: 1,
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsToLeft: vi.fn(),
      onCloseTabsToRight: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    });

    expect(actions.closeButtonTestId).toMatch(/^workspace-working-diff-close-/);
    expect(actions.menuEntries).not.toContainEqual(
      expect.objectContaining({ kind: "item", key: "copy-file-path" }),
    );
  });

  it("uses the same rename entry shape for agent and terminal tabs", () => {
    const terminalTab: WorkspaceTabDescriptor = {
      key: "terminal_abc",
      tabId: "terminal_abc",
      kind: "terminal",
      target: { kind: "terminal", terminalId: "terminal-abc" },
    };
    const menuTestIDBase = "workspace-tab-context";
    const sharedInput = {
      surface: "desktop" as const,
      index: 0,
      tabCount: 1,
      menuTestIDBase,
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab: vi.fn(),
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab: vi.fn(),
    };

    const agentEntries = buildWorkspaceTabMenuEntries({ ...sharedInput, tab: createAgentTab() });
    const terminalEntries = buildWorkspaceTabMenuEntries({ ...sharedInput, tab: terminalTab });

    const agentRename = agentEntries.find(
      (entry) => entry.kind === "item" && entry.key === "rename",
    );
    const terminalRename = terminalEntries.find(
      (entry) => entry.kind === "item" && entry.key === "rename",
    );
    if (!agentRename || agentRename.kind !== "item") throw new Error("Agent rename missing");
    if (!terminalRename || terminalRename.kind !== "item")
      throw new Error("Terminal rename missing");

    expect({
      key: agentRename.key,
      label: agentRename.label,
      icon: agentRename.icon,
      testID: agentRename.testID,
    }).toEqual({
      key: terminalRename.key,
      label: terminalRename.label,
      icon: terminalRename.icon,
      testID: terminalRename.testID,
    });

    const agentSeparator = agentEntries
      .slice(agentEntries.indexOf(agentRename) + 1)
      .find((entry) => entry.kind === "separator");
    const terminalSeparator = terminalEntries
      .slice(terminalEntries.indexOf(terminalRename) + 1)
      .find((entry) => entry.kind === "separator");
    expect(agentSeparator?.key).toBe("rename-separator");
    expect(terminalSeparator?.key).toBe("rename-separator");
  });

  it("hides an agent tab without closing it, and keeps hiding only agent tabs", () => {
    const onHideTab = vi.fn();
    const onCloseTab = vi.fn();
    const entries = buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: createAgentTab(),
      index: 0,
      tabCount: 1,
      menuTestIDBase: "workspace-tab-context-agent_123",
      onCopyResumeCommand: vi.fn(),
      onCopyAgentId: vi.fn(),
      onCopyConversationMarkdown: vi.fn(),
      onCopyTerminalId: vi.fn(),
      onCopyFilePath: vi.fn(),
      onReloadAgent: vi.fn(),
      onRenameTab: vi.fn(),
      onCloseTab,
      onCloseTabsBefore: vi.fn(),
      onCloseTabsAfter: vi.fn(),
      onCloseOtherTabs: vi.fn(),
      onHideTab,
    });

    const keys = itemKeys(entries);
    // Hide sits after reload and before close: hide removes the view, close ends the agent.
    expect(keys.indexOf("hide-agent")).toBeGreaterThan(keys.indexOf("reload-agent"));
    expect(keys.indexOf("hide-agent")).toBeLessThan(keys.indexOf("close"));
    const hideEntry = entries.find((entry) => entry.kind === "item" && entry.key === "hide-agent");
    if (!hideEntry || hideEntry.kind !== "item") {
      throw new Error("Hide entry missing");
    }
    // Hiding an agent that is still running must not read as a destructive gesture.
    expect(hideEntry.destructive).not.toBe(true);

    hideEntry.onSelect();
    expect(onHideTab).toHaveBeenCalledWith("agent_123");
    expect(onCloseTab).not.toHaveBeenCalled();
  });
});
