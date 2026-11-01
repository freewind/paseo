import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore, type Agent } from "@/stores/session-store";

/**
 * 恢复某个工作区里最近归档的那一个 agent，并打开它。没有可恢复的对象时返回 null，
 * 调用方据此不渲染菜单项，而不是渲染一个点了只会弹提示的空操作。
 *
 * 归档的 agent 仍然留在 session 的 agent map 里，所以这里只在本地找最新的那条，不发 list RPC。
 * 恢复动作与 agent panel 的 Unarchive 按钮一致：daemon 取消归档并把会话带回来。
 *
 * 放在菜单内容组件里调用：菜单打开才挂载，每行不会常驻一个 store 订阅。
 */
export function useRestoreLastArchivedAgent(input: {
  serverId: string | null | undefined;
  workspaceId: string | null | undefined;
}): (() => void) | null {
  const { t } = useTranslation();
  const toast = useToast();
  const serverId = input.serverId ?? "";
  const workspaceId = input.workspaceId ?? "";

  // 只订阅「有没有」这一个布尔值：agent map 变化时它能重新求值，但不会把整张表带进渲染。
  const hasArchivedAgent = useSessionStore(
    (state) =>
      Boolean(serverId && workspaceId) &&
      hasArchivedAgentInWorkspace(state.sessions[serverId]?.agents, workspaceId),
  );

  const restore = useCallback(() => {
    if (!serverId || !workspaceId) {
      return;
    }
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) {
      toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
      return;
    }
    // 点击时重新取一遍：菜单打开期间归档状态可能已经变了。
    const latest = findLatestArchivedAgent({
      agents: useSessionStore.getState().sessions[serverId]?.agents,
      workspaceId,
    });
    if (!latest) {
      toast.error(t("sidebar.workspace.toasts.noArchivedAgent"));
      return;
    }
    void (async () => {
      try {
        await client.refreshAgent(latest.id);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("sidebar.workspace.toasts.restoreArchivedAgentFailed"),
        );
        return;
      }
      // 恢复后 id 不变，所以快照落地之前就可以先把标签打开。
      navigateToWorkspace({
        serverId,
        workspaceId,
        target: { kind: "agent", agentId: latest.id },
      });
    })();
  }, [serverId, t, toast, workspaceId]);

  return useMemo(() => (hasArchivedAgent ? restore : null), [hasArchivedAgent, restore]);
}

export function hasArchivedAgentInWorkspace(
  agents: Map<string, Agent> | undefined,
  workspaceId: string,
): boolean {
  for (const agent of agents?.values() ?? []) {
    if (agent.workspaceId === workspaceId && agent.archivedAt) {
      return true;
    }
  }
  return false;
}

export function findLatestArchivedAgent(input: {
  agents: Map<string, Agent> | undefined;
  workspaceId: string;
}): Agent | null {
  let latest: Agent | null = null;
  let latestArchivedAt = 0;
  for (const agent of input.agents?.values() ?? []) {
    if (agent.workspaceId !== input.workspaceId) {
      continue;
    }
    const archivedAt = agent.archivedAt?.getTime() ?? 0;
    if (archivedAt > latestArchivedAt) {
      latest = agent;
      latestArchivedAt = archivedAt;
    }
  }
  return latest;
}
