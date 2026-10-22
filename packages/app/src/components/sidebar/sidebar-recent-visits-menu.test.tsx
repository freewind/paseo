/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { theme, mocks } = vi.hoisted(() => ({
  theme: {
    spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16 },
    iconSize: { sm: 14, md: 18 },
    borderWidth: { 1: 1 },
    borderRadius: { sm: 4, md: 6, lg: 8, xl: 12, full: 999 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    colors: {
      foreground: "#ffffff",
      foregroundMuted: "#aaaaaa",
      foregroundExtraMuted: "#a1a1aa",
      surfaceSidebarHover: "#222222",
    },
  },
  mocks: {
    navigateToWorkspace: vi.fn(),
    selection: { serverId: "server-1", workspaceId: "workspace-a" } as {
      serverId: string;
      workspaceId: string;
    } | null,
    workspaces: {} as Record<string, { title: string | null; name: string }>,
    agents: {} as Record<
      string,
      | {
          title: string | null;
          archivedAt: Date | null;
          parentAgentId?: string | null;
          updatedAt?: Date;
        }
      | undefined
    >,
    hosts: [] as { serverId: string; label: string }[],
    currentAgentId: null as string | null,
    layoutState: {
      layoutByWorkspace: {} as Record<string, unknown>,
      getWorkspaceTabs: (_workspaceKey: string) => [],
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "sidebar.recentVisits.trigger") return "Recent";
      if (key === "sidebar.recentVisits.empty") return "No recent sessions yet";
      if (key === "sidebar.recentVisits.current") return "Current";
      if (key === "sidebar.recentVisits.subagent") return "Subagent";
      return key;
    },
  }),
}));

vi.mock("lucide-react-native", () => ({
  ChevronDown: () => React.createElement("span", { "data-icon": "ChevronDown" }),
  Clock: () => React.createElement("span", { "data-icon": "Clock" }),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (spec: Record<string, unknown>) => spec.web ?? spec.default },
  Text: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
    <span data-testid={testID}>{children}</span>
  ),
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
  }: {
    children:
      | React.ReactNode
      | ((state: { pressed: boolean; hovered: boolean; open: boolean }) => React.ReactNode);
  }) => {
    const state = { pressed: false, hovered: false, open: false };
    return <div>{typeof children === "function" ? children(state) : children}</div>;
  },
  DropdownMenuContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  DropdownMenuHint: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    description,
    disabled,
    onSelect,
    testID,
    trailing,
  }: {
    children: React.ReactNode;
    description?: string;
    disabled?: boolean;
    onSelect?: () => void;
    testID?: string;
    trailing?: React.ReactNode;
  }) => (
    <button
      type="button"
      data-testid={testID}
      data-disabled={String(Boolean(disabled))}
      onClick={disabled ? undefined : onSelect}
    >
      <span>{children}</span>
      <span>{description}</span>
      <span>{trailing}</span>
    </button>
  ),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function" ? (factory as (t: typeof theme) => unknown)(theme) : factory,
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...rest
    }: { uniProps?: (t: typeof theme) => Record<string, unknown> } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => mocks.selection,
  navigateToWorkspace: mocks.navigateToWorkspace,
}));

vi.mock("@/stores/session-store-hooks", () => ({
  useWorkspace: (serverId: string, workspaceId: string) =>
    mocks.workspaces[`${serverId}:${workspaceId}`] ?? null,
}));

vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      sessions: {
        "server-1": {
          agents: {
            get: (agentId: string) => mocks.agents[`server-1:${agentId}`] ?? null,
          },
          agentDetails: { get: () => null },
        },
        "server-2": {
          agents: {
            get: (agentId: string) => mocks.agents[`server-2:${agentId}`] ?? null,
          },
          agentDetails: { get: () => null },
        },
      },
    }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => mocks.hosts,
}));

vi.mock("@/stores/workspace-layout-store", () => {
  const useWorkspaceLayoutStore = (selector: (state: typeof mocks.layoutState) => unknown) =>
    selector(mocks.layoutState);
  useWorkspaceLayoutStore.getState = () => mocks.layoutState;
  return { useWorkspaceLayoutStore };
});

vi.mock("@/screens/workspace/workspace-pane-state", () => ({
  deriveWorkspacePaneState: () => ({
    activeTab: mocks.currentAgentId
      ? {
          descriptor: {
            tabId: `agent_${mocks.currentAgentId}`,
            target: { kind: "agent", agentId: mocks.currentAgentId },
          },
        }
      : null,
  }),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { SidebarRecentVisitsMenu } from "./sidebar-recent-visits-menu";
import { navigationHistoryStore } from "@/stores/navigation-history-store";

describe("SidebarRecentVisitsMenu", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    navigationHistoryStore.reset();
    mocks.navigateToWorkspace.mockReset();
    mocks.selection = { serverId: "server-1", workspaceId: "workspace-a" };
    mocks.workspaces = {};
    mocks.agents = {};
    mocks.hosts = [];
    mocks.currentAgentId = null;
    // `useCurrentAgentId` reads the focused tab of a stored layout, so the workspace
    // needs one; the tab content still comes from the mocked `deriveWorkspacePaneState`.
    mocks.layoutState.layoutByWorkspace = { "server-1:workspace-a": {} };
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

  function visit(serverId: string, workspaceId: string, agentId: string): void {
    navigationHistoryStore.recordNavigation({
      pathname: `/h/${serverId}/workspace/${workspaceId}`,
      serverId,
      workspaceId,
      target: { kind: "agent", agentId },
      tabId: `agent_${agentId}`,
    });
  }

  function render(onBeforeNavigate?: () => void): void {
    act(() => {
      root?.render(<SidebarRecentVisitsMenu onBeforeNavigate={onBeforeNavigate} />);
    });
  }

  function item(agentId: string): HTMLElement | null {
    if (!container) {
      return null;
    }
    return container.querySelector<HTMLElement>(`[data-testid="sidebar-recent-visit-${agentId}"]`);
  }

  function press(agentId: string): void {
    act(() => {
      item(agentId)?.click();
    });
  }

  it("lists the most recent sessions first with title and workspace name", () => {
    mocks.workspaces["server-1:workspace-a"] = { title: null, name: "Workspace A" };
    mocks.agents["server-1:agent-a"] = { title: "Fix login", archivedAt: null };
    mocks.agents["server-1:agent-b"] = { title: "Write docs", archivedAt: null };
    visit("server-1", "workspace-a", "agent-a");
    visit("server-1", "workspace-a", "agent-b");

    render();

    expect(item("agent-b")?.textContent).toContain("Write docs");
    expect(item("agent-b")?.textContent).toContain("Workspace A");
    const rows = Array.from(
      container?.querySelectorAll('[data-testid^="sidebar-recent-visit-"]') ?? [],
    );
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "sidebar-recent-visit-agent-b",
      "sidebar-recent-visit-agent-a",
    ]);
  });

  it("marks the session the app is currently showing", () => {
    mocks.workspaces["server-1:workspace-a"] = { title: null, name: "Workspace A" };
    mocks.agents["server-1:agent-a"] = { title: "Fix login", archivedAt: null };
    mocks.agents["server-1:agent-b"] = { title: "Write docs", archivedAt: null };
    visit("server-1", "workspace-a", "agent-a");
    visit("server-1", "workspace-a", "agent-b");
    // The workspace's focused tab is what "current" means, not the last visit.
    mocks.currentAgentId = "agent-b";

    render();

    expect(item("agent-a")?.textContent).not.toContain("Current");
    expect(item("agent-b")?.textContent).toContain("Current");
  });

  it("marks a subagent Paseo manages, and only that kind", () => {
    mocks.workspaces["server-1:workspace-a"] = { title: null, name: "Workspace A" };
    mocks.agents["server-1:agent-a"] = { title: "Parent", archivedAt: null, parentAgentId: null };
    mocks.agents["server-1:agent-b"] = {
      title: "Child",
      archivedAt: null,
      parentAgentId: "agent-a",
    };
    visit("server-1", "workspace-a", "agent-a");
    visit("server-1", "workspace-a", "agent-b");

    render();

    expect(item("agent-a")?.textContent).not.toContain("Subagent");
    expect(item("agent-b")?.textContent).toContain("Subagent");
  });

  it("shows the raw ids when the host has not sent any metadata", () => {
    visit("server-1", "workspace-a", "agent-a");

    render();

    expect(item("agent-a")?.textContent).toContain("agent-a");
    expect(item("agent-a")?.textContent).toContain("workspace-a");
    expect(item("agent-a")?.getAttribute("data-disabled")).toBe("false");
  });

  it("names the host when the visit belongs to another one", () => {
    mocks.workspaces["server-2:workspace-b"] = { title: "Release", name: "workspace-b" };
    mocks.agents["server-2:agent-c"] = { title: "Ship it", archivedAt: null };
    mocks.hosts = [
      { serverId: "server-1", label: "Mac mini" },
      { serverId: "server-2", label: "Studio" },
    ];
    visit("server-2", "workspace-b", "agent-c");

    render();

    expect(item("agent-c")?.textContent).toContain("Studio · Release");
  });

  it("keeps an archived session visible but not enterable", () => {
    mocks.agents["server-1:agent-a"] = { title: "Old work", archivedAt: new Date() };
    visit("server-1", "workspace-a", "agent-a");

    render();
    press("agent-a");

    expect(item("agent-a")?.getAttribute("data-disabled")).toBe("true");
    expect(mocks.navigateToWorkspace).not.toHaveBeenCalled();
  });

  it("closes the sidebar before navigating to the chosen session", () => {
    const onBeforeNavigate = vi.fn();
    mocks.agents["server-1:agent-a"] = { title: "Fix login", archivedAt: null };
    visit("server-1", "workspace-a", "agent-a");

    render(onBeforeNavigate);
    press("agent-a");

    expect(mocks.navigateToWorkspace).toHaveBeenCalledWith({
      serverId: "server-1",
      workspaceId: "workspace-a",
      target: { kind: "agent", agentId: "agent-a" },
    });
    expect(onBeforeNavigate).toHaveBeenCalledOnce();
    expect(onBeforeNavigate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.navigateToWorkspace.mock.invocationCallOrder[0],
    );
  });

  it("shows how long ago the session was updated", () => {
    mocks.agents["server-1:agent-a"] = {
      title: "Fix login",
      archivedAt: null,
      updatedAt: new Date(Date.now() - 5 * 60_000),
    };
    visit("server-1", "workspace-a", "agent-a");

    render();

    const updated = container?.querySelector(
      '[data-testid="sidebar-recent-visit-updated-agent-a"]',
    );
    expect(updated?.textContent).toBe("5m");
  });

  it("shows an empty state before anything has been visited", () => {
    render();

    expect(
      container?.querySelector('[data-testid="sidebar-recent-visits-empty"]')?.textContent,
    ).toBe("No recent sessions yet");
  });
});
