import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { i18n } from "@/i18n/i18next";
import { encodeFilePathForPathSegment, encodeWorkspaceIdForPathSegment } from "@/utils/host-routes";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";

export type WorkspaceTabMenuSurface = "desktop" | "mobile";

export interface WorkspaceTabMenuLabels {
  copyResumeCommand: string;
  copyAgentId: string;
  copyTerminalId: string;
  copyFilePath: string;
  rename: string;
  closeAbove: string;
  closeBelow: string;
  closeLeft: string;
  closeRight: string;
  closeOthers: string;
  reloadAgent: string;
  reloadAgentTooltip: string;
  close: string;
}

export const DEFAULT_WORKSPACE_TAB_MENU_LABELS: WorkspaceTabMenuLabels = {
  copyResumeCommand: i18n.t("workspace.tabs.menu.copyResumeCommand"),
  copyAgentId: i18n.t("workspace.tabs.menu.copyAgentId"),
  copyTerminalId: i18n.t("workspace.tabs.menu.copyTerminalId"),
  copyFilePath: i18n.t("workspace.tabs.menu.copyFilePath"),
  rename: i18n.t("workspace.tabs.menu.rename"),
  closeAbove: i18n.t("workspace.tabs.menu.closeAbove"),
  closeBelow: i18n.t("workspace.tabs.menu.closeBelow"),
  closeLeft: i18n.t("workspace.tabs.menu.closeLeft"),
  closeRight: i18n.t("workspace.tabs.menu.closeRight"),
  closeOthers: i18n.t("workspace.tabs.menu.closeOthers"),
  reloadAgent: i18n.t("workspace.tabs.menu.reloadAgent"),
  reloadAgentTooltip: i18n.t("workspace.tabs.menu.reloadAgentTooltip"),
  close: i18n.t("workspace.tabs.menu.close"),
};

export type WorkspaceTabMenuEntry =
  | {
      kind: "item";
      key: string;
      label: string;
      icon?:
        | "copy"
        | "rotate-cw"
        | "arrow-left-to-line"
        | "arrow-right-to-line"
        | "copy-x"
        | "pencil"
        | "external-link"
        | "folder-open"
        | "x";
      hint?: string;
      tooltip?: string;
      disabled?: boolean;
      destructive?: boolean;
      testID: string;
      onSelect: () => void;
    }
  | {
      kind: "separator";
      key: string;
    }
  | {
      /** Where the file tab's "Open with…" row goes; it renders only for files with several panels. */
      kind: "file-panel-open-with";
      key: string;
    };

/** 文件标签菜单里由调用方准备好的一项：文案已含目标名，目标不可用时 run 是空操作。 */
interface WorkspaceTabFileOpenAction {
  label: string;
  run: (filePath: string) => void;
}

export interface WorkspaceTabFileOpenActions {
  openInEditor?: WorkspaceTabFileOpenAction;
  reveal?: WorkspaceTabFileOpenAction;
}

interface BuildWorkspaceTabMenuEntriesInput {
  surface: WorkspaceTabMenuSurface;
  tab: WorkspaceTabDescriptor;
  index: number;
  tabCount: number;
  menuTestIDBase: string;
  /**
   * 文件标签多出来的两项。label 已含目标名（与文件浏览器菜单同一句文案），run 在目标不可用
   * 时是空操作：调用方照常传，缺哪项就不出哪个菜单项。
   */
  fileOpenActions?: WorkspaceTabFileOpenActions;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyTerminalId: (terminalId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsBefore: (tabId: string) => Promise<void> | void;
  onCloseTabsAfter: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  labels?: WorkspaceTabMenuLabels;
}

interface BuildWorkspaceDesktopTabActionsInput {
  tab: WorkspaceTabDescriptor;
  index: number;
  tabCount: number;
  fileOpenActions?: WorkspaceTabFileOpenActions;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyTerminalId: (terminalId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  labels?: WorkspaceTabMenuLabels;
}

export interface WorkspaceDesktopTabActions {
  contextMenuTestId: string;
  menuEntries: WorkspaceTabMenuEntry[];
  closeButtonTestId: string;
}

function buildCloseBeforeLabel(
  surface: WorkspaceTabMenuSurface,
  labels: WorkspaceTabMenuLabels,
): string {
  return surface === "mobile" ? labels.closeAbove : labels.closeLeft;
}

function buildCloseAfterLabel(
  surface: WorkspaceTabMenuSurface,
  labels: WorkspaceTabMenuLabels,
): string {
  return surface === "mobile" ? labels.closeBelow : labels.closeRight;
}

function buildCloseBeforeTestIDSuffix(surface: WorkspaceTabMenuSurface): string {
  return surface === "mobile" ? "close-above" : "close-left";
}

function buildCloseAfterTestIDSuffix(surface: WorkspaceTabMenuSurface): string {
  return surface === "mobile" ? "close-below" : "close-right";
}

function getCloseButtonTestId(tab: WorkspaceTabDescriptor): string {
  if (tab.target.kind === "agent") {
    return `workspace-agent-close-${tab.target.agentId}`;
  }
  if (tab.target.kind === "terminal") {
    return `workspace-terminal-close-${tab.target.terminalId}`;
  }
  if (tab.target.kind === "draft") {
    return `workspace-draft-close-${tab.target.draftId}`;
  }
  if (tab.target.kind === "browser") {
    return `workspace-browser-close-${tab.target.browserId}`;
  }
  if (tab.target.kind === "setup") {
    return `workspace-setup-close-${encodeWorkspaceIdForPathSegment(tab.target.workspaceId)}`;
  }
  if (tab.target.kind === "provider_subagent") {
    return `workspace-provider-subagent-close-${tab.target.subagentId}`;
  }
  if (tab.target.kind === "commit_diff") {
    return `workspace-commit-diff-close-${encodeFilePathForPathSegment(tab.target.sha)}`;
  }
  if (tab.target.kind === "working_diff" || tab.target.kind === "changes_tree") {
    return `workspace-working-diff-close-${encodeFilePathForPathSegment(buildDeterministicWorkspaceTabId(tab.target))}`;
  }
  if (tab.target.kind === "files" || tab.target.kind === "pull_request") {
    return `workspace-${tab.target.kind}-close`;
  }
  if (tab.target.kind === "plugin") {
    return `workspace-plugin-close-${encodeFilePathForPathSegment(buildDeterministicWorkspaceTabId(tab.target))}`;
  }
  if (tab.target.kind === "new_tab") {
    return `workspace-new-tab-close-${tab.tabId}`;
  }
  return `workspace-file-close-${encodeFilePathForPathSegment(tab.target.path)}`;
}

export function buildWorkspaceTabMenuEntries(
  input: BuildWorkspaceTabMenuEntriesInput,
): WorkspaceTabMenuEntry[] {
  const {
    surface,
    tab,
    index,
    tabCount,
    menuTestIDBase,
    onCopyResumeCommand,
    onCopyAgentId,
    onCopyTerminalId,
    onCopyFilePath,
    onReloadAgent,
    onRenameTab,
    onCloseTab,
    onCloseTabsBefore,
    onCloseTabsAfter,
    onCloseOtherTabs,
    fileOpenActions,
  } = input;
  const labels = input.labels ?? DEFAULT_WORKSPACE_TAB_MENU_LABELS;
  const isFirstTab = index === 0;
  const isLastTab = index === tabCount - 1;
  const isOnlyTab = tabCount <= 1;
  const entries: WorkspaceTabMenuEntry[] = [];

  if (tab.target.kind === "agent") {
    const { agentId } = tab.target;
    entries.push({
      kind: "item",
      key: "copy-resume-command",
      label: labels.copyResumeCommand,
      icon: "copy",
      testID: `${menuTestIDBase}-copy-resume-command`,
      onSelect: () => {
        void onCopyResumeCommand(agentId);
      },
    });
    entries.push({
      kind: "item",
      key: "copy-agent-id",
      label: labels.copyAgentId,
      icon: "copy",
      hint: agentId.slice(0, 7),
      testID: `${menuTestIDBase}-copy-agent-id`,
      onSelect: () => {
        void onCopyAgentId(agentId);
      },
    });
  }

  if (tab.target.kind === "terminal") {
    const { terminalId } = tab.target;
    entries.push({
      kind: "item",
      key: "copy-terminal-id",
      label: labels.copyTerminalId,
      icon: "copy",
      hint: terminalId.slice(0, 7),
      testID: `${menuTestIDBase}-copy-terminal-id`,
      onSelect: () => {
        void onCopyTerminalId(terminalId);
      },
    });
  }

  if (tab.target.kind === "file") {
    const filePath = tab.target.path;
    // 顺序与文件浏览器菜单一致：打开方式在前，复制路径居中，「在文件管理器中显示」紧跟其后。
    const openInEditor = fileOpenActions?.openInEditor;
    if (openInEditor) {
      entries.push({
        kind: "item",
        key: "open-in-editor",
        label: openInEditor.label,
        icon: "external-link",
        testID: `${menuTestIDBase}-open-in-editor`,
        onSelect: () => {
          openInEditor.run(filePath);
        },
      });
    }
    entries.push({
      kind: "item",
      key: "copy-file-path",
      label: labels.copyFilePath,
      icon: "copy",
      testID: `${menuTestIDBase}-copy-file-path`,
      onSelect: () => {
        void onCopyFilePath(filePath);
      },
    });
    const reveal = fileOpenActions?.reveal;
    if (reveal) {
      entries.push({
        kind: "item",
        key: "reveal-file",
        label: reveal.label,
        icon: "folder-open",
        testID: `${menuTestIDBase}-reveal-file`,
        onSelect: () => {
          reveal.run(filePath);
        },
      });
    }
    entries.push({ kind: "file-panel-open-with", key: "file-panel-open-with" });
  }

  if (tab.target.kind === "agent" || tab.target.kind === "terminal") {
    entries.push({
      kind: "item",
      key: "rename",
      label: labels.rename,
      icon: "pencil",
      testID: `${menuTestIDBase}-rename`,
      onSelect: () => {
        onRenameTab(tab);
      },
    });
    entries.push({
      kind: "separator",
      key: "rename-separator",
    });
  }

  entries.push({
    kind: "item",
    key: "close-before",
    label: buildCloseBeforeLabel(surface, labels),
    icon: "arrow-left-to-line",
    disabled: isFirstTab,
    testID: `${menuTestIDBase}-${buildCloseBeforeTestIDSuffix(surface)}`,
    onSelect: () => {
      void onCloseTabsBefore(tab.tabId);
    },
  });
  entries.push({
    kind: "item",
    key: "close-after",
    label: buildCloseAfterLabel(surface, labels),
    icon: "arrow-right-to-line",
    disabled: isLastTab,
    testID: `${menuTestIDBase}-${buildCloseAfterTestIDSuffix(surface)}`,
    onSelect: () => {
      void onCloseTabsAfter(tab.tabId);
    },
  });
  entries.push({
    kind: "item",
    key: "close-others",
    label: labels.closeOthers,
    icon: "copy-x",
    disabled: isOnlyTab,
    testID: `${menuTestIDBase}-close-others`,
    onSelect: () => {
      void onCloseOtherTabs(tab.tabId);
    },
  });
  if (tab.target.kind === "agent") {
    const { agentId } = tab.target;
    entries.push({
      kind: "item",
      key: "reload-agent",
      label: labels.reloadAgent,
      icon: "rotate-cw",
      tooltip: labels.reloadAgentTooltip,
      testID: `${menuTestIDBase}-reload-agent`,
      onSelect: () => {
        void onReloadAgent(agentId);
      },
    });
  }
  entries.push({
    kind: "item",
    key: "close",
    label: labels.close,
    icon: "x",
    testID: `${menuTestIDBase}-close`,
    onSelect: () => {
      void onCloseTab(tab.tabId);
    },
  });

  return entries;
}

export function buildWorkspaceDesktopTabActions(
  input: BuildWorkspaceDesktopTabActionsInput,
): WorkspaceDesktopTabActions {
  const contextMenuTestId = `workspace-tab-context-${input.tab.tabId}`;
  return {
    contextMenuTestId,
    menuEntries: buildWorkspaceTabMenuEntries({
      surface: "desktop",
      tab: input.tab,
      index: input.index,
      tabCount: input.tabCount,
      menuTestIDBase: contextMenuTestId,
      onCopyResumeCommand: input.onCopyResumeCommand,
      onCopyAgentId: input.onCopyAgentId,
      onCopyTerminalId: input.onCopyTerminalId,
      onCopyFilePath: input.onCopyFilePath,
      onReloadAgent: input.onReloadAgent,
      onRenameTab: input.onRenameTab,
      onCloseTab: input.onCloseTab,
      onCloseTabsBefore: input.onCloseTabsToLeft,
      onCloseTabsAfter: input.onCloseTabsToRight,
      onCloseOtherTabs: input.onCloseOtherTabs,
      labels: input.labels,
      fileOpenActions: input.fileOpenActions,
    }),
    closeButtonTestId: getCloseButtonTestId(input.tab),
  };
}
