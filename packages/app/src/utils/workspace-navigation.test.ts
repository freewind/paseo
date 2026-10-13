import { describe, expect, it } from "vitest";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { prepareWorkspaceTab } from "@/utils/prepare-workspace-tab";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "/repo/worktree";
const AGENT_ID = "agent-1";

interface RecordedOpenedTab {
  key: string;
  target: WorkspaceTabTarget;
  tabId?: string;
  pin: boolean;
}

function createFakeLayout() {
  const openedTabs: RecordedOpenedTab[] = [];
  return {
    openedTabs,
    openTab: ({
      workspaceKey: key,
      target,
      tabId,
      pin = false,
    }: {
      workspaceKey: string;
      target: WorkspaceTabTarget;
      tabId?: string;
      pin?: boolean;
    }) => {
      openedTabs.push({ key, target, tabId, pin });
      return target.kind === "agent" ? target.agentId : null;
    },
  };
}

describe("prepareWorkspaceTab", () => {
  it("opens and focuses an agent tab", () => {
    const layout = createFakeLayout();

    prepareWorkspaceTab(
      {
        serverId: SERVER_ID,
        workspaceId: WORKSPACE_ID,
        target: { kind: "agent", agentId: AGENT_ID },
      },
      layout,
    );

    expect(layout.openedTabs).toEqual([
      {
        key: "server-1:/repo/worktree",
        target: { kind: "agent", agentId: AGENT_ID },
        pin: false,
      },
    ]);
  });

  it("requests pinned visibility in the same command that reveals an agent", () => {
    const layout = createFakeLayout();

    prepareWorkspaceTab(
      {
        serverId: SERVER_ID,
        workspaceId: WORKSPACE_ID,
        target: { kind: "agent", agentId: AGENT_ID },
        pin: true,
      },
      layout,
    );

    expect(layout.openedTabs).toEqual([
      {
        key: "server-1:/repo/worktree",
        target: { kind: "agent", agentId: AGENT_ID },
        pin: true,
      },
    ]);
  });

  it("forwards a remembered tab instance so the opener can land on it", () => {
    const layout = createFakeLayout();

    prepareWorkspaceTab(
      {
        serverId: SERVER_ID,
        workspaceId: WORKSPACE_ID,
        target: { kind: "new_tab" },
        tabId: "tab_1",
      },
      layout,
    );

    expect(layout.openedTabs).toEqual([
      {
        key: "server-1:/repo/worktree",
        target: { kind: "new_tab" },
        tabId: "tab_1",
        pin: false,
      },
    ]);
  });
});
