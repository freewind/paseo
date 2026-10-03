/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setStringAsyncMock, navigateToAgentMock, selectionRef } = vi.hoisted(() => ({
  setStringAsyncMock: vi.fn(() => Promise.resolve()),
  navigateToAgentMock: vi.fn(),
  selectionRef: {
    current: { serverId: "server-1", workspaceId: "workspace-a" } as {
      serverId: string;
      workspaceId: string;
    },
  },
}));

vi.mock("expo-clipboard", () => ({ setStringAsync: setStringAsyncMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/utils/navigate-to-agent", () => ({ navigateToAgent: navigateToAgentMock }));

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => selectionRef.current,
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ copied: vi.fn(), error: vi.fn(), show: vi.fn() }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ fetchAgentTimeline: vi.fn() }),
  useHostRuntimeIsConnected: () => true,
}));

vi.mock("@/hooks/use-archive-agent", () => ({
  useArchiveAgent: () => ({ archiveAgent: vi.fn(() => Promise.resolve()) }),
}));

// `react-native-unistyles` and `lucide-react-native` are already aliased to the shared test
// doubles in vitest.config.ts, so this file must not re-stub them.

// The rename modal mounts the adaptive sheet, whose styles need theme tokens the shared test
// double does not carry. The list only needs the modal to exist.
vi.mock("@/components/rename-modal", () => ({
  AdaptiveRenameModal: () => null,
  RenameModal: () => null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
    <button type="button" data-testid={testID}>
      {typeof children === "function"
        ? (children as (state: unknown) => React.ReactNode)({
            hovered: false,
            pressed: false,
            open: false,
          })
        : children}
    </button>
  ),
  DropdownMenuContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  DropdownMenuSeparator: () => <div role="separator" />,
  DropdownMenuItem: ({
    children,
    onSelect,
    testID,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: vi.fn(() => Promise.resolve(true)) }));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { SidebarWorkspaceAgentList } from "@/components/sidebar/sidebar-workspace-agent-list";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";

const WORKSPACE_KEY = "server-1:workspace-a";

function entry(): SidebarWorkspaceEntry {
  return {
    workspaceKey: WORKSPACE_KEY,
    serverId: "server-1",
    workspaceId: "workspace-a",
    projectViewKey: "view-1",
    projectName: "paseo",
    projectKind: "local",
    workspaceKind: "local",
    name: "paseo",
    workspaceDirectory: "/repo/paseo",
    workspaceDirectoryLabel: "paseo",
    title: null,
    currentBranch: "main",
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: {},
    hasRunningScripts: false,
    activeAgentCount: 0,
    statusBucket: "idle",
    statusEnteredAt: null,
  } as unknown as SidebarWorkspaceEntry;
}

function agent(agentId: string, title: string | null): Agent {
  return { id: agentId, title } as unknown as Agent;
}

describe("SidebarWorkspaceAgentList", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    navigateToAgentMock.mockClear();
    selectionRef.current = { serverId: "server-1", workspaceId: "workspace-a" };
    // The layout store is a module singleton, so tabs opened by an earlier test would otherwise
    // still be there for a test that opens none.
    useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  });

  function render() {
    act(() => {
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <SidebarWorkspaceAgentList workspace={entry()} />
        </QueryClientProvider>,
      );
    });
  }

  function seedAgents(ids: string[], titleFor: (id: string) => string | null = () => null) {
    act(() => {
      useSessionStore.setState({
        sessions: {
          "server-1": {
            agents: new Map(ids.map((id) => [id, agent(id, titleFor(id))])),
          },
        } as never,
      });
    });
  }

  function openAgentTabs(ids: string[]) {
    act(() => {
      useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
      for (const id of ids) {
        useWorkspaceLayoutStore.getState().openTab({
          workspaceKey: WORKSPACE_KEY,
          target: { kind: "agent", agentId: id },
          intent: "reveal",
        });
      }
    });
  }

  function agentRows(): HTMLElement[] {
    return Array.from(
      container!.querySelectorAll<HTMLElement>('[data-testid^="sidebar-workspace-agent-open-"]'),
    );
  }

  it("renders one row per agent tab, in tab order", () => {
    openAgentTabs(["agent-a", "agent-b"]);
    seedAgents(["agent-a", "agent-b"]);
    render();

    expect(agentRows()).toHaveLength(2);
    expect(agentRows().map((row) => row.textContent)).toEqual(["agent-a", "agent-b"]);
  });

  it("shows the agent's own title rather than its id", () => {
    openAgentTabs(["agent-a"]);
    seedAgents(["agent-a"], () => "Rewrite the sidebar");
    render();

    expect(agentRows().map((row) => row.textContent)).toEqual(["Rewrite the sidebar"]);
  });

  it("falls back to the agent id when the title is the untitled placeholder", () => {
    openAgentTabs(["agent-a"]);
    seedAgents(["agent-a"], () => "New agent");
    render();

    expect(agentRows().map((row) => row.textContent)).toEqual(["agent-a"]);
  });

  it("renders nothing when the workspace has no agent tabs", () => {
    seedAgents(["agent-a"]);
    render();

    expect(agentRows()).toHaveLength(0);
  });

  it("selects only the focused tab of the active workspace", () => {
    openAgentTabs(["agent-a", "agent-b"]);
    seedAgents(["agent-a", "agent-b"]);
    render();

    const selected = agentRows().filter((row) => row.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe("agent-b");
  });

  it("selects no row when another workspace is the active one", () => {
    openAgentTabs(["agent-a"]);
    seedAgents(["agent-a"]);
    render();
    selectionRef.current = { serverId: "server-2", workspaceId: "workspace-zzz" };
    render();
    expect(agentRows().filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(
      0,
    );
  });

  it("navigates to the agent when its row is pressed", () => {
    openAgentTabs(["agent-a"]);
    seedAgents(["agent-a"]);
    render();

    const row = agentRows()[0];
    expect(row).toBeDefined();
    act(() => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(navigateToAgentMock).toHaveBeenCalledWith({
      serverId: "server-1",
      agentId: "agent-a",
      workspaceId: "workspace-a",
    });
  });
});
