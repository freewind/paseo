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
      throw new Error(i18n.t("workspace.agentUnread.hostUpgradeRequired"));
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
