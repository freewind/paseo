/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/h/server-1/workspace/workspace-a",
  activeTarget: null as { kind: string; agentId?: string } | null,
  activeTabId: "agent_agent-1",
  layoutState: {
    layoutByWorkspace: {} as Record<string, unknown>,
    getWorkspaceTabs: (_workspaceKey: string) => [],
  },
  navigateToWorkspace: vi.fn(),
  routerNavigate: vi.fn(),
}));

vi.mock("expo-router", () => ({
  usePathname: () => mocks.pathname,
  router: { navigate: mocks.routerNavigate },
}));

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToWorkspace: mocks.navigateToWorkspace,
}));

vi.mock("@/stores/workspace-layout-store", () => {
  const useWorkspaceLayoutStore = (selector: (state: typeof mocks.layoutState) => unknown) =>
    selector(mocks.layoutState);
  useWorkspaceLayoutStore.getState = () => mocks.layoutState;
  return { useWorkspaceLayoutStore };
});

vi.mock("@/screens/workspace/workspace-pane-state", () => ({
  deriveWorkspacePaneState: () => ({
    activeTab: mocks.activeTarget
      ? { descriptor: { tabId: mocks.activeTabId, target: mocks.activeTarget } }
      : null,
  }),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { NavigationHistoryBridge } from "./navigation-history-bridge";
import { navigationHistoryStore } from "@/stores/navigation-history-store";

const WORKSPACE_PATH = "/h/server-1/workspace/workspace-a";

describe("NavigationHistoryBridge", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    navigationHistoryStore.reset();
    mocks.pathname = WORKSPACE_PATH;
    mocks.activeTarget = { kind: "agent", agentId: "agent-1" };
    mocks.activeTabId = "agent_agent-1";
    mocks.navigateToWorkspace.mockReset();
    mocks.routerNavigate.mockReset();
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
    navigationHistoryStore.reset();
  });

  function render(): void {
    act(() => {
      root?.render(<NavigationHistoryBridge />);
    });
  }

  function observe(
    pathname: string,
    target: typeof mocks.activeTarget,
    tabId = "agent_agent-1",
  ): void {
    mocks.pathname = pathname;
    mocks.activeTarget = target;
    mocks.activeTabId = tabId;
    render();
  }

  function recordedEntries() {
    return navigationHistoryStore.getSnapshot().entries;
  }

  function replay() {
    return navigationHistoryStore.getSnapshot().replay;
  }

  it("records the initial workspace position with its focused agent", () => {
    render();

    const entries = recordedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      pathname: WORKSPACE_PATH,
      serverId: "server-1",
      workspaceId: "workspace-a",
      target: { kind: "agent", agentId: "agent-1" },
      tabId: "agent_agent-1",
    });
  });

  it("records a Chat switch that keeps the pathname", () => {
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" });

    const entries = recordedEntries();
    expect(entries).toHaveLength(2);
    expect(navigationHistoryStore.getSnapshot().cursor).toBe(1);
    expect(entries[1].target).toEqual({ kind: "agent", agentId: "agent-2" });
  });

  it("does not record a page hop with no workspace context", () => {
    render();
    observe("/settings", { kind: "agent", agentId: "agent-1" });

    const entries = recordedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].pathname).toBe(WORKSPACE_PATH);
  });

  it("records agent chats across a page in between", () => {
    render();
    observe("/settings", null);
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" }, "agent_agent-2");

    const entries = recordedEntries();
    expect(entries.map((entry) => entry.target)).toEqual([
      { kind: "agent", agentId: "agent-1" },
      { kind: "agent", agentId: "agent-2" },
    ]);
  });

  it("ignores repeated observations without changes", () => {
    render();
    render();
    render();

    expect(recordedEntries()).toHaveLength(1);
  });

  it("records the focused agent as recently visited", () => {
    render();
    observe("/settings", null);

    expect(navigationHistoryStore.getRecentAgentVisits()).toEqual([
      { serverId: "server-1", workspaceId: "workspace-a", agentId: "agent-1" },
    ]);
  });

  it("collects the agent a jump actually arrived at", () => {
    mocks.activeTarget = { kind: "agent", agentId: "agent-2" };
    mocks.activeTabId = "agent_agent-2";
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-1" });

    act(() => {
      navigationHistoryStore.navigateBack();
    });
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" }, "agent_agent-2");

    expect(navigationHistoryStore.getRecentAgentVisits().map((visit) => visit.agentId)).toEqual([
      "agent-2",
      "agent-1",
    ]);
  });

  it("replays a back jump to a workspace entry through navigateToWorkspace", () => {
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" });

    act(() => {
      navigationHistoryStore.navigateBack();
    });

    expect(mocks.navigateToWorkspace).toHaveBeenCalledWith({
      serverId: "server-1",
      workspaceId: "workspace-a",
      target: { kind: "agent", agentId: "agent-1" },
      tabId: "agent_agent-1",
    });

    // The jump settles: the target becomes observable and the replay clears
    // without appending a duplicate entry.
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-1" });

    expect(replay()).toBeNull();
    expect(recordedEntries()).toHaveLength(2);
    expect(navigationHistoryStore.getSnapshot().cursor).toBe(0);
  });

  it("discards intermediate observations while a replay is in flight", () => {
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" }, "agent_agent-2");

    act(() => {
      navigationHistoryStore.navigateBack();
    });

    // The route changed, but to a different workspace than the target.
    observe("/h/server-1/workspace/workspace-b", { kind: "agent", agentId: "agent-9" });

    expect(recordedEntries().map((entry) => entry.target)).toEqual([
      { kind: "agent", agentId: "agent-1" },
      { kind: "agent", agentId: "agent-2" },
    ]);
    expect(replay()).not.toBeNull();
  });

  it("replays forward to the next entry", () => {
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" }, "agent_agent-2");

    act(() => {
      navigationHistoryStore.navigateBack();
    });
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-1" });

    act(() => {
      navigationHistoryStore.navigateForward();
    });

    expect(mocks.navigateToWorkspace).toHaveBeenLastCalledWith({
      serverId: "server-1",
      workspaceId: "workspace-a",
      target: { kind: "agent", agentId: "agent-2" },
      tabId: "agent_agent-2",
    });
  });

  it("replays an agent entry with its remembered instance", () => {
    mocks.activeTarget = { kind: "agent", agentId: "agent-1" };
    mocks.activeTabId = "tab_1";
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" }, "agent_agent-2");

    act(() => {
      navigationHistoryStore.navigateBack();
    });

    expect(mocks.navigateToWorkspace).toHaveBeenCalledWith({
      serverId: "server-1",
      workspaceId: "workspace-a",
      target: { kind: "agent", agentId: "agent-1" },
      tabId: "tab_1",
    });

    // The remembered instance is still open: the jump settles on it.
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-1" }, "tab_1");

    expect(replay()).toBeNull();
    expect(recordedEntries()).toHaveLength(2);
  });

  it("settles a jump that had to open a fresh tab for the agent", () => {
    mocks.activeTarget = { kind: "agent", agentId: "agent-1" };
    mocks.activeTabId = "tab_1";
    render();
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-2" }, "agent_agent-2");

    act(() => {
      navigationHistoryStore.navigateBack();
    });

    // The remembered tab was closed, so the jump opened another tab for the agent.
    observe(WORKSPACE_PATH, { kind: "agent", agentId: "agent-1" }, "tab_9");

    const snapshot = navigationHistoryStore.getSnapshot();
    expect(snapshot.replay).toBeNull();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0].tabId).toBe("tab_9");
  });
});
