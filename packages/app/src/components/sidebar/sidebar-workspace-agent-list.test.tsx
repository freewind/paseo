/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setStringAsyncMock, navigateToAgentMock, archiveAgentMock, updateAgentMock, selectionRef } =
  vi.hoisted(() => ({
    setStringAsyncMock: vi.fn(() => Promise.resolve()),
    navigateToAgentMock: vi.fn(),
    archiveAgentMock: vi.fn(() => Promise.resolve()),
    updateAgentMock: vi.fn(() => Promise.resolve()),
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
  useArchiveAgent: () => ({ archiveAgent: archiveAgentMock }),
}));

vi.mock("@/utils/client-id", () => ({ getOrCreateClientId: async () => "client-1" }));

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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadAppSettingsFromStorage } from "@/hooks/use-settings";
import { APP_SETTINGS_KEY, APP_SETTINGS_QUERY_KEY } from "@/hooks/use-settings/storage";
import {
  buildWorkspaceTabSnapshot,
  deriveWorkspaceAgentVisibility,
} from "@/workspace-tabs/agent-visibility";
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

function agent(agentId: string, title: string | null, extra: Partial<Agent> = {}): Agent {
  return { id: agentId, title, ...extra } as unknown as Agent;
}

describe("SidebarWorkspaceAgentList", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(async () => {
    navigateToAgentMock.mockClear();
    archiveAgentMock.mockClear();
    updateAgentMock.mockClear();
    updateAgentMock.mockImplementation(() => Promise.resolve());
    selectionRef.current = { serverId: "server-1", workspaceId: "workspace-a" };
    // The layout store is a module singleton, so tabs opened by an earlier test would otherwise
    // still be there for a test that opens none.
    useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
    // The persisted app settings drive the "Title lines" switch, so a test that seeds it must not
    // leak that value into the next test.
    await AsyncStorage.clear();
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

  function seedAgents(agents: Agent[], options: { withClient?: boolean } = {}): void {
    act(() => {
      useSessionStore.setState({
        sessions: {
          "server-1": {
            agents: new Map(agents.map((seeded) => [seeded.id, seeded])),
            client: options.withClient ? { updateAgent: updateAgentMock } : null,
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

  function agentTitles(): HTMLElement[] {
    return Array.from(
      container!.querySelectorAll<HTMLElement>('[data-testid^="sidebar-workspace-agent-title-"]'),
    );
  }

  // `useAppSettings` resolves the persisted blob through react-query, so a plain first paint lands
  // before the switch arrives. Prefetching under the same key means the component reads a settled
  // cache instead of racing the query.
  async function renderWithSettings() {
    const client = new QueryClient();
    await client.prefetchQuery({
      queryKey: APP_SETTINGS_QUERY_KEY,
      queryFn: () => loadAppSettingsFromStorage(),
    });
    act(() => {
      root?.render(
        <QueryClientProvider client={client}>
          <SidebarWorkspaceAgentList workspace={entry()} />
        </QueryClientProvider>,
      );
    });
  }

  async function seedMultilineTitleSetting(enabled: boolean) {
    await AsyncStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({ workspaceTitleMultiline: enabled }),
    );
  }

  it("renders one row per agent tab, in tab order", () => {
    openAgentTabs(["agent-a", "agent-b"]);
    seedAgents([agent("agent-a", null), agent("agent-b", null)]);
    render();

    expect(agentRows()).toHaveLength(2);
    expect(agentRows().map((row) => row.textContent)).toEqual(["agent-a", "agent-b"]);
  });

  it("shows the agent's own title rather than its id", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", "Rewrite the sidebar")]);
    render();

    expect(agentRows().map((row) => row.textContent)).toEqual(["Rewrite the sidebar"]);
  });

  it("falls back to the agent id when the title is the untitled placeholder", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", "New agent")]);
    render();

    expect(agentRows().map((row) => row.textContent)).toEqual(["agent-a"]);
  });

  it("renders nothing when the workspace has no agent tabs", () => {
    seedAgents([agent("agent-a", null)]);
    render();

    expect(agentRows()).toHaveLength(0);
  });

  it("keeps the agent title on one line by default", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", "Rewrite the sidebar")]);
    render();

    // The RNW one-line style is the only thing that truncates, so assert on the resolved style
    // rather than on a prop the DOM does not carry.
    const [title] = agentTitles();
    expect(getComputedStyle(title).whiteSpace).toBe("nowrap");
    expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
  });

  it("lets the agent title wrap when the workspace title lines setting is on", async () => {
    await seedMultilineTitleSetting(true);
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", "Rewrite the sidebar")]);
    await renderWithSettings();

    const [title] = agentTitles();
    expect(getComputedStyle(title).whiteSpace).not.toBe("nowrap");
    expect(getComputedStyle(title).textOverflow).not.toBe("ellipsis");
  });

  it("selects only the focused tab of the active workspace", () => {
    openAgentTabs(["agent-a", "agent-b"]);
    seedAgents([agent("agent-a", null), agent("agent-b", null)]);
    render();

    const selected = agentRows().filter((row) => row.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe("agent-b");
  });

  it("selects no row when another workspace is the active one", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)]);
    render();
    selectionRef.current = { serverId: "server-2", workspaceId: "workspace-zzz" };
    render();
    expect(agentRows().filter((row) => row.getAttribute("aria-selected") === "true")).toHaveLength(
      0,
    );
  });

  it("navigates to the agent when its row is pressed", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)]);
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

  function hideButton(): HTMLElement {
    const button = container!.querySelector<HTMLElement>('[data-testid$="-hide-agent"]');
    if (!button) throw new Error("Hide agent entry missing");
    return button;
  }

  async function hideFirstAgent(): Promise<void> {
    const button = hideButton();
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function reconcile(workspaceId: string, workspaceKey: string): void {
    act(() => {
      useWorkspaceLayoutStore.getState().reconcileTabs(
        workspaceKey,
        buildWorkspaceTabSnapshot({
          agentVisibility: deriveWorkspaceAgentVisibility({
            sessionAgents: useSessionStore.getState().sessions["server-1"]?.agents,
            workspaceId,
          }),
          agentsHydrated: true,
          terminalsHydrated: true,
          knownTerminalIds: [],
          standaloneTerminalIds: [],
          hasActivePendingTerminalCreate: false,
          hasActivePendingDraftCreate: false,
        }),
      );
    });
  }

  it("hides a running agent tab without archiving or closing the agent", async () => {
    openAgentTabs(["agent-a"]);
    seedAgents([
      agent("agent-a", "Running agent", { status: "running", workspaceId: "workspace-a" }),
    ]);
    render();

    await hideFirstAgent();

    expect(agentRows()).toHaveLength(0);
    expect(archiveAgentMock).not.toHaveBeenCalled();
    // A root agent is only unlisted, not stopped: no lifecycle RPC is sent at all.
    expect(updateAgentMock).not.toHaveBeenCalled();
    expect(useSessionStore.getState().sessions["server-1"]?.agents.get("agent-a")?.status).toBe(
      "running",
    );

    // Reconciliation must not put the tab back while the agent is still active.
    reconcile("workspace-a", WORKSPACE_KEY);
    expect(agentRows()).toHaveLength(0);
  });

  it("hides a subagent tab, releasing this client's open-tab label and reopening from the parent's track", async () => {
    openAgentTabs(["agent-a"]);
    seedAgents(
      [
        agent("agent-a", null, {
          parentAgentId: "parent-1",
          status: "running",
          workspaceId: "workspace-a",
        }),
      ],
      { withClient: true },
    );
    render();

    await hideFirstAgent();

    expect(agentRows()).toHaveLength(0);
    expect(updateAgentMock).toHaveBeenCalledWith("agent-a", {
      labels: { "paseo.open-agent-tab.client-1": "false" },
    });
    expect(archiveAgentMock).not.toHaveBeenCalled();

    // The child stays unarchived and still parented, so the parent's track can bring it back.
    const stored = useSessionStore.getState().sessions["server-1"]?.agents.get("agent-a");
    expect(stored?.parentAgentId).toBe("parent-1");
    expect(stored?.archivedAt ?? null).toBeNull();

    act(() => {
      useWorkspaceLayoutStore.getState().openTab({
        workspaceKey: WORKSPACE_KEY,
        target: { kind: "agent", agentId: "agent-a" },
        intent: "reveal",
      });
    });
    reconcile("workspace-a", WORKSPACE_KEY);
    render();

    expect(agentRows().map((row) => row.textContent)).toEqual(["agent-a"]);
  });

  it("keeps a subagent tab when the open-tab label cannot be released", async () => {
    updateAgentMock.mockImplementation(() => Promise.reject(new Error("daemon unreachable")));
    openAgentTabs(["agent-a"]);
    seedAgents(
      [agent("agent-a", null, { parentAgentId: "parent-1", workspaceId: "workspace-a" })],
      { withClient: true },
    );
    render();

    await hideFirstAgent();

    expect(agentRows()).toHaveLength(1);
    expect(archiveAgentMock).not.toHaveBeenCalled();
  });

  it("does not hide the same agent in another workspace", async () => {
    const otherKey = "server-1:workspace-b";
    openAgentTabs(["agent-a"]);
    act(() => {
      useWorkspaceLayoutStore.getState().openTab({
        workspaceKey: otherKey,
        target: { kind: "agent", agentId: "agent-a" },
        intent: "reveal",
      });
    });
    seedAgents([agent("agent-a", null, { workspaceId: "workspace-a" })]);
    render();

    await hideFirstAgent();

    expect(agentRows()).toHaveLength(0);
    expect(
      useWorkspaceLayoutStore
        .getState()
        .getWorkspaceTabs(otherKey)
        .some((tab) => tab.target.kind === "agent" && tab.target.agentId === "agent-a"),
    ).toBe(true);
    expect(
      Array.from(useWorkspaceLayoutStore.getState().hiddenAgentIdsByWorkspace[otherKey] ?? []),
    ).toEqual([]);
  });
});
