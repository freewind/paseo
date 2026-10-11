import { i18n } from "@/i18n/i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useSessionStore } from "@/stores/session-store";

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
  const focusedPaneId = layout.layoutByWorkspace[workspaceKey]?.focusedPaneId;
  const focusedPaneContainsAgent =
    focusedPaneId !== null &&
    layout
      .getWorkspaceTabs(workspaceKey)
      .some((tab) => tab.target.kind === "agent" && tab.target.agentId === agentId);
  let focusToken: string | null = null;
  if ((agentId && focusedPaneContainsAgent) || (!agentId && focusedPaneId)) {
    focusToken = layout.unfocusPane(workspaceKey);
  }
  try {
    if (agentId) viewedTimelineSync?.releaseVisibleAgent(agentId);
    await client.markWorkspaceUnread(workspaceId, undefined, agentId);
  } catch (error) {
    if (focusToken) {
      layout.restorePaneFocus(workspaceKey, focusToken);
    }
    if (agentId) viewedTimelineSync?.releaseVisibleAgent(agentId);
    throw error;
  }
}
