import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { restoreHiddenWorkspaceAgents } from "@/workspace-tabs/restore-hidden-agents";

function agent(id: string, parentAgentId: string | null = null): Agent {
  return { id, parentAgentId, workspaceId: "workspace-a", archivedAt: null } as Agent;
}

describe("restoreHiddenWorkspaceAgents", () => {
  it("activates the workspace before background-opening hidden roots and children", () => {
    const order: string[] = [];
    const opened: Array<{ agentId: string; intent: string; placement?: unknown }> = [];
    const result = restoreHiddenWorkspaceAgents({
      serverId: "server-a",
      workspaceId: "workspace-a",
      readSnapshot: () => ({
        hasHydratedAgents: true,
        hasHydratedLayout: true,
        sessionAgents: new Map([
          ["child", agent("child", "parent")],
          ["root", agent("root")],
        ]),
        explicitlyHiddenAgentIds: new Set(["child", "root"]),
      }),
      navigateToWorkspace: (input) => {
        order.push(`navigate:${input.serverId}:${input.workspaceId}`);
      },
      openTab: (input) => {
        order.push(
          `open:${(input.target as Extract<WorkspaceTabTarget, { kind: "agent" }>).agentId}`,
        );
        opened.push({
          agentId: (input.target as Extract<WorkspaceTabTarget, { kind: "agent" }>).agentId,
          intent: input.intent,
          placement: input.placement,
        });
        return `tab-${opened.length}`;
      },
      focusedPaneId: () => "pane-focused",
    });

    expect(result).toEqual(["child", "root"]);
    expect(order).toEqual(["navigate:server-a:workspace-a", "open:child", "open:root"]);
    expect(opened).toEqual([
      {
        agentId: "child",
        intent: "background",
        placement: { mode: "prefer", paneId: "pane-focused" },
      },
      {
        agentId: "root",
        intent: "background",
        placement: { mode: "prefer", paneId: "pane-focused" },
      },
    ]);
  });

  it("uses the same current focused pane for the entire ordered batch", () => {
    const placements: Array<unknown> = [];
    restoreHiddenWorkspaceAgents({
      serverId: "server-a",
      workspaceId: "workspace-a",
      readSnapshot: () => ({
        hasHydratedAgents: true,
        hasHydratedLayout: true,
        sessionAgents: new Map([
          ["one", agent("one")],
          ["two", agent("two")],
        ]),
        explicitlyHiddenAgentIds: new Set(["one", "two"]),
      }),
      navigateToWorkspace: () => undefined,
      openTab: (input) => {
        placements.push(input.placement);
        return input.target.kind === "agent" ? input.target.agentId : null;
      },
      focusedPaneId: () => "current-pane",
    });
    expect(placements).toEqual([
      { mode: "prefer", paneId: "current-pane" },
      { mode: "prefer", paneId: "current-pane" },
    ]);
  });

  it("navigates but does not open one agent at a time", () => {
    const navigations: string[] = [];
    const opened: string[] = [];
    restoreHiddenWorkspaceAgents({
      serverId: "server-a",
      workspaceId: "workspace-a",
      readSnapshot: () => ({
        hasHydratedAgents: true,
        hasHydratedLayout: true,
        sessionAgents: new Map([
          ["root", agent("root")],
          ["child", agent("child", "root")],
        ]),
        explicitlyHiddenAgentIds: new Set(["root", "child"]),
      }),
      navigateToWorkspace: ({ workspaceId }) => navigations.push(workspaceId),
      openTab: ({ target }) => {
        if (target.kind === "agent") opened.push(target.agentId);
        return target.kind === "agent" ? target.agentId : null;
      },
      focusedPaneId: () => null,
    });
    expect(navigations).toEqual(["workspace-a"]);
    expect(opened).toEqual(["root", "child"]);
  });

  it("keeps the actual explicit-hidden state when opening returns no tab", () => {
    const workspaceKey = "server-a:workspace-a";
    useWorkspaceLayoutStore.setState({
      explicitlyHiddenAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
    });
    useWorkspaceLayoutStore.getState().hideAgentExplicitly(workspaceKey, "root");
    const result = restoreHiddenWorkspaceAgents({
      serverId: "server-a",
      workspaceId: "workspace-a",
      readSnapshot: () => ({
        hasHydratedAgents: true,
        hasHydratedLayout: true,
        sessionAgents: new Map([["root", agent("root")]]),
        explicitlyHiddenAgentIds:
          useWorkspaceLayoutStore.getState().explicitlyHiddenAgentIdsByWorkspace[workspaceKey],
      }),
      navigateToWorkspace: () => undefined,
      openTab: () => null,
      focusedPaneId: () => null,
    });

    expect(result).toEqual([]);
    expect(
      useWorkspaceLayoutStore.getState().explicitlyHiddenAgentIdsByWorkspace[workspaceKey],
    ).toEqual(new Set(["root"]));
  });

  it("does nothing until both agent and layout state are hydrated", () => {
    let navigated = false;
    let opened = false;
    const result = restoreHiddenWorkspaceAgents({
      serverId: "server-a",
      workspaceId: "workspace-a",
      readSnapshot: () => ({
        hasHydratedAgents: true,
        hasHydratedLayout: false,
        sessionAgents: new Map([["root", agent("root")]]),
        explicitlyHiddenAgentIds: new Set(["root"]),
      }),
      navigateToWorkspace: () => {
        navigated = true;
      },
      openTab: () => {
        opened = true;
        return null;
      },
      focusedPaneId: () => null,
    });

    expect(result).toEqual([]);
    expect(navigated).toBe(false);
    expect(opened).toBe(false);
  });
});
