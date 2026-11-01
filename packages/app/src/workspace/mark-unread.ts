import { i18n } from "@/i18n/i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useSessionStore } from "@/stores/session-store";
import { findPaneById } from "@/stores/workspace-layout-store";

export async function markWorkspaceUnread(
  serverId: string,
  workspaceId: string,
  agentId?: string,
): Promise<void> {
  const client = getHostRuntimeStore().getClient(serverId);
  if (!client) {
    throw new Error(i18n.t("workspace.terminal.hostDisconnected"));
  }

  const workspaceKey = `${serverId}:${workspaceId}`;
  const layout = useWorkspaceLayoutStore.getState();
  const viewedTimelineSync = useSessionStore.getState().sessions[serverId]?.viewedTimelineSync;
  // End viewing before restoring attention. The next pane focus reads it normally;
  // leaving the workspace must not consume the mark the user just made.
  // 指定 agent 时只在「它就在当前聚焦的面板里」才收焦点：别的面板正在看的 agent 不该被牵连。
  const workspaceLayout = layout.layoutByWorkspace[workspaceKey];
  const focusedPane = findPaneById(workspaceLayout?.root ?? null, workspaceLayout?.focusedPaneId);
  const focusedPaneTabIds = new Set(focusedPane?.tabIds ?? []);
  const focusedPaneContainsAgent =
    agentId != null &&
    layout
      .getWorkspaceTabs(workspaceKey)
      .some(
        (tab) =>
          focusedPaneTabIds.has(tab.tabId) &&
          tab.target.kind === "agent" &&
          tab.target.agentId === agentId,
      );
  let focusToken: string | null = null;
  if ((agentId && focusedPaneContainsAgent) || (!agentId && workspaceLayout?.focusedPaneId)) {
    focusToken = layout.unfocusPane(workspaceKey);
  }
  try {
    // 只标记单个 agent 时，先把它从「正在看」的可见集合里放出来，否则下一次同步会把标记吃掉。
    if (agentId) viewedTimelineSync?.releaseVisibleAgent(agentId);
    await client.markWorkspaceUnread(workspaceId, undefined, agentId);
  } catch (error) {
    if (focusToken) {
      layout.restorePaneFocus(workspaceKey, focusToken);
    }
    if (agentId) viewedTimelineSync?.restoreVisibleAgent(agentId);
    throw error;
  }
}
