import { describe, expect, it } from "vitest";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { resolveActiveTtsAgentId, resolveFocusedWorkspaceAgentId } from "./active-tts-agent";

interface PaneSpec {
  id: string;
  tabs: { tabId: string; target: WorkspaceTabTarget }[];
  focusedTabId: string | null;
}

function layout(panes: PaneSpec[], focusedPaneId: string | null = "main"): WorkspaceLayout {
  return {
    focusedPaneId,
    root: {
      kind: "group",
      group: {
        children: panes.map((pane) => ({
          kind: "pane" as const,
          pane: {
            id: pane.id,
            tabIds: pane.tabs.map((tab) => tab.tabId),
            focusedTabId: pane.focusedTabId,
            tabs: pane.tabs.map((tab) => ({ ...tab, createdAt: 1 })),
          },
        })),
      },
    },
  } as unknown as WorkspaceLayout;
}

const agentLayout = layout([
  {
    id: "main",
    tabs: [
      { tabId: "tab-a", target: { kind: "agent", agentId: "agent-a" } },
      { tabId: "tab-file", target: { kind: "file", path: "/repo/README.md" } },
    ],
    focusedTabId: "tab-a",
  },
]);

describe("focused workspace agent", () => {
  it("is the focused tab's agent", () => {
    expect(resolveFocusedWorkspaceAgentId(agentLayout)).toBe("agent-a");
  });

  it("is null without a layout", () => {
    expect(resolveFocusedWorkspaceAgentId(null)).toBeNull();
  });

  it("is null when the focused pane has no focused tab", () => {
    expect(resolveFocusedWorkspaceAgentId(layout([]))).toBeNull();
  });

  it("is null when the focused tab is a file, not a chat", () => {
    const fileFocused = layout([
      {
        id: "main",
        tabs: [
          { tabId: "tab-a", target: { kind: "agent", agentId: "agent-a" } },
          { tabId: "tab-file", target: { kind: "file", path: "/repo/README.md" } },
        ],
        focusedTabId: "tab-file",
      },
    ]);
    expect(resolveFocusedWorkspaceAgentId(fileFocused)).toBeNull();
  });

  it("ignores agents in unfocused panes", () => {
    const split = layout(
      [
        {
          id: "main",
          tabs: [{ tabId: "tab-a", target: { kind: "agent", agentId: "agent-a" } }],
          focusedTabId: "tab-a",
        },
        {
          id: "right",
          tabs: [{ tabId: "tab-b", target: { kind: "agent", agentId: "agent-b" } }],
          focusedTabId: "tab-b",
        },
      ],
      "right",
    );
    expect(resolveFocusedWorkspaceAgentId(split)).toBe("agent-b");
  });
});

describe("active tts agent", () => {
  it("follows a dedicated agent route for the same host", () => {
    expect(
      resolveActiveTtsAgentId({
        serverId: "host-1",
        routeAgent: { serverId: "host-1", agentId: "agent-9" },
        selection: null,
        layout: null,
      }),
    ).toBe("agent-9");
  });

  it("ignores another host's agent route", () => {
    expect(
      resolveActiveTtsAgentId({
        serverId: "host-1",
        routeAgent: { serverId: "host-2", agentId: "agent-9" },
        selection: null,
        layout: null,
      }),
    ).toBeNull();
  });

  it("prefers the route over the workspace layout, so a split pane cannot steal the reading", () => {
    expect(
      resolveActiveTtsAgentId({
        serverId: "host-1",
        routeAgent: { serverId: "host-1", agentId: "agent-9" },
        selection: { serverId: "host-1", workspaceId: "ws-1" },
        layout: agentLayout,
      }),
    ).toBe("agent-9");
  });

  it("falls back to the active workspace's focused agent", () => {
    expect(
      resolveActiveTtsAgentId({
        serverId: "host-1",
        routeAgent: null,
        selection: { serverId: "host-1", workspaceId: "ws-1" },
        layout: agentLayout,
      }),
    ).toBe("agent-a");
  });

  it("stays silent when the active workspace is another host's", () => {
    expect(
      resolveActiveTtsAgentId({
        serverId: "host-1",
        routeAgent: null,
        selection: { serverId: "host-2", workspaceId: "ws-1" },
        layout: agentLayout,
      }),
    ).toBeNull();
  });

  it("stays silent when no workspace is open", () => {
    expect(
      resolveActiveTtsAgentId({
        serverId: "host-1",
        routeAgent: null,
        selection: null,
        layout: null,
      }),
    ).toBeNull();
  });
});
