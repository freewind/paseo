import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import {
  buildSidebarWorkspaceAgentRows,
  findFocusedWorkspaceTabId,
} from "@/components/sidebar/sidebar-workspace-agent-rows";
import { createWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

const WORKSPACE_KEY = "server-1:workspace-a";

function createStore() {
  const store = createWorkspaceLayoutStore();
  store.setState({ layoutByWorkspace: {} });
  return store;
}

function layoutOf(store: ReturnType<typeof createStore>) {
  const layout = store.getState().layoutByWorkspace[WORKSPACE_KEY];
  if (!layout) throw new Error("Expected a layout for the workspace");
  return layout;
}

function openTab(store: ReturnType<typeof createStore>, target: WorkspaceTabTarget): string {
  const tabId = store.getState().openTab({ workspaceKey: WORKSPACE_KEY, target, intent: "reveal" });
  if (!tabId) throw new Error(`Expected ${target.kind} tab to open`);
  return tabId;
}

describe("buildSidebarWorkspaceAgentRows", () => {
  it("returns nothing for a workspace with no layout", () => {
    expect(buildSidebarWorkspaceAgentRows(null)).toEqual([]);
    expect(buildSidebarWorkspaceAgentRows(undefined)).toEqual([]);
  });

  it("returns nothing when the workspace holds no agent tabs", () => {
    const store = createStore();
    openTab(store, { kind: "terminal", terminalId: "term-1" });
    openTab(store, { kind: "changes_tree" });

    expect(buildSidebarWorkspaceAgentRows(layoutOf(store))).toEqual([]);
  });

  it("keeps only agent tabs, in tab order", () => {
    const store = createStore();
    openTab(store, { kind: "terminal", terminalId: "term-1" });
    const firstAgentTab = openTab(store, { kind: "agent", agentId: "agent-1" });
    openTab(store, { kind: "changes_tree" });
    const secondAgentTab = openTab(store, { kind: "agent", agentId: "agent-2" });

    const rows = buildSidebarWorkspaceAgentRows(layoutOf(store));

    expect(rows.map((row) => row.agentId)).toEqual(["agent-1", "agent-2"]);
    expect(rows.map((row) => row.tabId)).toEqual([firstAgentTab, secondAgentTab]);
  });

  it("walks split panes in tree order so the list matches the tab strip", () => {
    const store = createStore();
    const splitTab = openTab(store, { kind: "agent", agentId: "agent-split" });
    const rightPaneId = store
      .getState()
      .splitPane(WORKSPACE_KEY, { tabId: splitTab, targetPaneId: "main", position: "right" });
    if (!rightPaneId) throw new Error("Expected the split to create a right pane");
    const mainTab = store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "agent", agentId: "agent-main" },
      intent: "reveal",
      placement: { mode: "pane", paneId: "main" },
    });
    if (!mainTab) throw new Error("Expected the main pane's agent tab to open");
    const rightTab = store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "agent", agentId: "agent-right" },
      intent: "reveal",
      placement: { mode: "pane", paneId: rightPaneId },
    });
    if (!rightTab) throw new Error("Expected the right pane's agent tab to open");

    const rows = buildSidebarWorkspaceAgentRows(layoutOf(store));

    // Tree order: the main pane's strip first, then the pane split off to the right.
    expect(rows.map((row) => row.tabId)).toEqual([mainTab, splitTab, rightTab]);
  });

  it("never lists the same agent twice: reveal moves the tab instead of adding one", () => {
    const store = createStore();
    const firstTab = openTab(store, { kind: "agent", agentId: "agent-shared" });
    const rightPaneId = store
      .getState()
      .splitPaneEmpty(WORKSPACE_KEY, { targetPaneId: "main", position: "right" });
    if (!rightPaneId) throw new Error("Expected the split to create a right pane");
    const secondTab = store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "agent", agentId: "agent-shared" },
      intent: "reveal",
      placement: { mode: "pane", paneId: rightPaneId },
    });

    expect(secondTab).toBe(firstTab);
    expect(buildSidebarWorkspaceAgentRows(layoutOf(store))).toHaveLength(1);
  });
});

describe("findFocusedWorkspaceTabId", () => {
  it("has no focused tab without a layout", () => {
    expect(findFocusedWorkspaceTabId(null)).toBeNull();
    expect(findFocusedWorkspaceTabId(undefined)).toBeNull();
  });

  it("returns the focused pane's tab, not the first agent tab", () => {
    const store = createStore();
    const firstTab = openTab(store, { kind: "agent", agentId: "agent-1" });
    const secondTab = openTab(store, { kind: "agent", agentId: "agent-2" });

    expect(findFocusedWorkspaceTabId(layoutOf(store))).toBe(secondTab);

    store.getState().focusTab(WORKSPACE_KEY, firstTab);
    expect(findFocusedWorkspaceTabId(layoutOf(store))).toBe(firstTab);
  });

  it("follows the focused pane when the workspace is split", () => {
    const store = createStore();
    const mainTab = openTab(store, { kind: "agent", agentId: "agent-main" });
    const rightPaneId = store
      .getState()
      .splitPaneEmpty(WORKSPACE_KEY, { targetPaneId: "main", position: "right" });
    if (!rightPaneId) throw new Error("Expected the split to create a right pane");
    const rightTab = store.getState().openTab({
      workspaceKey: WORKSPACE_KEY,
      target: { kind: "agent", agentId: "agent-right" },
      intent: "reveal",
      placement: { mode: "pane", paneId: rightPaneId },
    });
    if (!rightTab) throw new Error("Expected the agent tab to open in the right pane");

    expect(findFocusedWorkspaceTabId(layoutOf(store))).toBe(rightTab);

    store.getState().focusPane(WORKSPACE_KEY, "main");
    expect(findFocusedWorkspaceTabId(layoutOf(store))).toBe(mainTab);
  });
});
