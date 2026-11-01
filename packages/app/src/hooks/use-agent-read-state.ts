import { useCallback, useMemo } from "react";
import { i18n } from "@/i18n/i18next";
import { useHostFeature } from "@/runtime/host-features";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { markWorkspaceUnread } from "@/workspace/mark-unread";
import { useSessionStore } from "@/stores/session-store";
import { canMarkAgentUnread } from "@/workspace/agent-unread-policy";
import { useToast } from "@/contexts/toast-context";

export interface AgentReadStateController {
  canMarkUnread: boolean;
  markUnread: () => Promise<void>;
}

/**
 * 单个 agent 的「手动设为未读」入口。宿主不支持时（老 daemon）`canMarkUnread` 为 false，
 * 菜单项不出现；状态判定交给 agent-unread-policy，这里只负责与宿主和 store 接线。
 */
export function useAgentReadState({
  serverId,
  workspaceId,
  agentId,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
}): AgentReadStateController {
  const supportsAgentTarget = useHostFeature(serverId, "workspaceMarkUnreadAgentTarget");
  const toast = useToast();
  const agentState = useSessionStore((state) => {
    const session = state.sessions[serverId];
    const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId) ?? null;
    return canMarkAgentUnread({ session, agent, workspaceId });
  });
  const canMarkUnread = supportsAgentTarget && agentState;

  const markUnread = useCallback(async () => {
    if (!supportsAgentTarget) {
      throw new Error(i18n.t("workspace.tabs.agentUnread.hostUpgradeRequired"));
    }
    if (!agentState) return;
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) throw new Error(i18n.t("workspace.terminal.hostDisconnected"));
    try {
      await markWorkspaceUnread(serverId, workspaceId, agentId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : i18n.t("workspace.terminal.hostDisconnected"),
      );
    }
  }, [agentId, agentState, serverId, supportsAgentTarget, toast, workspaceId]);

  return useMemo(() => ({ canMarkUnread, markUnread }), [canMarkUnread, markUnread]);
}
