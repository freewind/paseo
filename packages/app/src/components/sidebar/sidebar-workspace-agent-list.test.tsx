/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  setStringAsyncMock,
  navigateToAgentMock,
  archiveAgentMock,
  updateAgentMock,
  selectionRef,
  compactLayoutRef,
  navigationPanelTargets,
} = vi.hoisted(() => ({
  setStringAsyncMock: vi.fn(() => Promise.resolve()),
  navigateToAgentMock: vi.fn(),
  compactLayoutRef: { current: true },
  navigationPanelTargets: [] as string[],
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

vi.mock("@/constants/layout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/constants/layout")>()),
  useIsCompactFormFactor: () => compactLayoutRef.current,
}));

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
import { usePanelStore } from "@/stores/panel-store";
import { createFakeDesktopBridge, createInMemoryKeyValueStorage } from "@/hooks/use-settings/fakes";
import {
  APP_SETTINGS_KEY,
  APP_SETTINGS_QUERY_KEY,
  loadAppSettingsFromStorage,
} from "@/hooks/use-settings/storage";
import {
  buildWorkspaceTabSnapshot,
  deriveWorkspaceAgentVisibility,
} from "@/workspace-tabs/agent-visibility";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { MessageSubmissionRecord } from "@/composer/submission/model";
import { TURN_LIVENESS_IDLE } from "@/timeline/turn-liveness";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";

const WORKSPACE_KEY = "server-1:workspace-a";

function entry(workspaceId = "workspace-a"): SidebarWorkspaceEntry {
  return {
    workspaceKey: `server-1:${workspaceId}`,
    serverId: "server-1",
    workspaceId,
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
  return {
    id: agentId,
    title,
    status: "idle",
    pendingPermissions: [],
    turn: TURN_LIVENESS_IDLE,
    ...extra,
  } as unknown as Agent;
}

describe("SidebarWorkspaceAgentList", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    navigateToAgentMock.mockClear();
    navigationPanelTargets.length = 0;
    compactLayoutRef.current = true;
    usePanelStore.setState({
      mobilePanel: { target: "agent-list", revision: 0 },
      desktop: { ...usePanelStore.getState().desktop, agentListOpen: true },
    });
    navigateToAgentMock.mockImplementation(() => {
      navigationPanelTargets.push(usePanelStore.getState().mobilePanel.target);
    });
    archiveAgentMock.mockClear();
    updateAgentMock.mockClear();
    updateAgentMock.mockImplementation(() => Promise.resolve());
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

  function render(workspace = entry()) {
    act(() => {
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <SidebarWorkspaceAgentList workspace={workspace} />
        </QueryClientProvider>,
      );
    });
  }

  function seedAgents(
    agents: Agent[],
    options: {
      withClient?: boolean;
      messageSubmissions?: Map<string, MessageSubmissionRecord[]>;
    } = {},
  ): void {
    act(() => {
      useSessionStore.setState({
        sessions: {
          "server-1": {
            agents: new Map(agents.map((seeded) => [seeded.id, seeded])),
            agentDetails: new Map(),
            messageSubmissions: options.messageSubmissions ?? new Map(),
            client: options.withClient ? { updateAgent: updateAgentMock } : null,
          },
        } as never,
      });
    });
  }

  function openAgentTabs(ids: string[], workspaceKey = WORKSPACE_KEY) {
    act(() => {
      useWorkspaceLayoutStore.setState({ layoutByWorkspace: {} });
      for (const id of ids) {
        useWorkspaceLayoutStore.getState().openTab({
          workspaceKey,
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
  // before the switch arrives. Reading the seeded blob into that same query key up front means the
  // component renders against a settled cache instead of racing the query.
  async function renderWithStoredSettings(stored: Record<string, unknown> = {}) {
    const client = new QueryClient();
    await client.prefetchQuery({
      queryKey: APP_SETTINGS_QUERY_KEY,
      queryFn: () =>
        loadAppSettingsFromStorage({
          storage: createInMemoryKeyValueStorage({ [APP_SETTINGS_KEY]: JSON.stringify(stored) }),
          desktop: createFakeDesktopBridge(),
        }),
    });
    act(() => {
      root?.render(
        <QueryClientProvider client={client}>
          <SidebarWorkspaceAgentList workspace={entry()} />
        </QueryClientProvider>,
      );
    });
  }

  it("renders one row per agent tab, in tab order", () => {
    openAgentTabs(["agent-a", "agent-b"]);
    seedAgents([agent("agent-a", null), agent("agent-b", null)]);
    render();

    expect(agentRows()).toHaveLength(2);
    expect(agentRows().map((row) => row.textContent)).toEqual(["agent-a", "agent-b"]);
  });

  function rowStatus(index: number): string | null {
    const slot = agentRows()[index]?.querySelector<HTMLElement>(
      '[data-testid^="sidebar-workspace-agent-status-"]',
    );
    // The tab id carries hyphens, the bucket never does, so the bucket is the trailing segment.
    const testID = slot?.dataset.testid;
    return testID ? testID.slice(testID.lastIndexOf("-") + 1) : null;
  }

  it("shows an open turn as running, even when the lifecycle status has not caught up", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([
      agent("agent-a", null, {
        status: "idle",
        turn: {
          phase: "open",
          turnId: "turn-1",
          startedAt: new Date(),
          cancellationRequestId: null,
        },
      }),
    ]);
    render();

    expect(rowStatus(0)).toBe("running");
  });

  it("shows an unacknowledged message submission as running before the turn opens", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)], {
      messageSubmissions: new Map([
        ["agent-a", [{ clientMessageId: "m1", providerAcknowledged: false, rpcSettled: false }]],
      ]),
    });
    render();

    expect(rowStatus(0)).toBe("running");
  });

  it("shows a pending permission as needing input", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([
      agent("agent-a", null, {
        status: "running",
        pendingPermissions: [
          { id: "perm-1", provider: "codex", name: "shell", input: {}, requestedAt: new Date() },
        ] as unknown as Agent["pendingPermissions"],
      }),
    ]);
    render();

    expect(rowStatus(0)).toBe("needs_input");
  });

  it("shows an agent waiting on the user as attention and an idle one as done", () => {
    openAgentTabs(["agent-a", "agent-b"]);
    seedAgents([
      agent("agent-a", null, { requiresAttention: true, attentionReason: "finished" }),
      agent("agent-b", null),
    ]);
    render();

    expect(rowStatus(0)).toBe("attention");
    expect(rowStatus(1)).toBe("done");
  });

  it("shows a failed agent as failed", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null, { status: "error" })]);
    render();

    expect(rowStatus(0)).toBe("failed");
  });

  it("reserves the leading slot for a tab whose agent the session has not hydrated", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([]);
    render();

    expect(rowStatus(0)).toBe("unknown");
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
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", "Rewrite the sidebar")]);
    await renderWithStoredSettings({ workspaceTitleMultiline: true });

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

  it("closes the mobile agent list before navigating to the selected agent", () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)]);
    render();

    const row = agentRows()[0];
    expect(row).toBeDefined();
    act(() => {
      row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(usePanelStore.getState().mobilePanel).toEqual({ target: "agent", revision: 1 });
    expect(navigationPanelTargets).toEqual(["agent"]);
    expect(navigateToAgentMock).toHaveBeenCalledExactlyOnceWith({
      serverId: "server-1",
      agentId: "agent-a",
      workspaceId: "workspace-a",
    });
  });

  it("does not change the mobile panel when the selected agent is already visible", () => {
    usePanelStore.setState({ mobilePanel: { target: "agent", revision: 4 } });
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)]);
    render();

    act(() => {
      agentRows()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(usePanelStore.getState().mobilePanel).toEqual({ target: "agent", revision: 4 });
    expect(navigationPanelTargets).toEqual(["agent"]);
    expect(navigateToAgentMock).toHaveBeenCalledExactlyOnceWith({
      serverId: "server-1",
      agentId: "agent-a",
      workspaceId: "workspace-a",
    });
  });

  it("closes the mobile panel when an agent from another workspace is selected", () => {
    openAgentTabs(["agent-b"], "server-1:workspace-b");
    seedAgents([agent("agent-b", null, { workspaceId: "workspace-b" })]);
    render(entry("workspace-b"));

    act(() => {
      agentRows()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(usePanelStore.getState().mobilePanel).toEqual({ target: "agent", revision: 1 });
    expect(navigateToAgentMock).toHaveBeenCalledExactlyOnceWith({
      serverId: "server-1",
      agentId: "agent-b",
      workspaceId: "workspace-b",
    });
  });

  it("keeps the desktop sidebar state unchanged when an agent row is pressed", () => {
    compactLayoutRef.current = false;
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)]);
    render();

    act(() => {
      agentRows()[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(usePanelStore.getState().mobilePanel).toEqual({ target: "agent-list", revision: 0 });
    expect(usePanelStore.getState().desktop.agentListOpen).toBe(true);
    expect(navigationPanelTargets).toEqual(["agent-list"]);
    expect(navigateToAgentMock).toHaveBeenCalledExactlyOnceWith({
      serverId: "server-1",
      agentId: "agent-a",
      workspaceId: "workspace-a",
    });
  });

  it("does not close the mobile agent list when a menu action is used", async () => {
    openAgentTabs(["agent-a"]);
    seedAgents([agent("agent-a", null)]);
    render();

    const menuTrigger = container!.querySelector<HTMLElement>(
      '[data-testid^="sidebar-workspace-agent-menu-"][data-testid$="-trigger"]',
    );
    expect(menuTrigger).not.toBeNull();
    act(() => {
      menuTrigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(usePanelStore.getState().mobilePanel).toEqual({ target: "agent-list", revision: 0 });
    expect(navigateToAgentMock).not.toHaveBeenCalled();

    await hideFirstAgent();

    expect(usePanelStore.getState().mobilePanel).toEqual({ target: "agent-list", revision: 0 });
    expect(navigationPanelTargets).toEqual([]);
    expect(navigateToAgentMock).not.toHaveBeenCalled();
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
