import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { fetchAgentHistoryPage } from "@/hooks/use-agent-history";

/** 菜单项始终可点；只有点击时才查当前工作区最近归档的 agent。 */
export function useRestoreLastArchivedAgent(input: {
  serverId: string | null | undefined;
  workspaceId: string | null | undefined;
}): () => void {
  const { t } = useTranslation();
  const toast = useToast();
  const serverId = input.serverId ?? "";
  const workspaceId = input.workspaceId ?? "";

  return useCallback(() => {
    if (!serverId || !workspaceId) {
      return;
    }
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) {
      toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
      return;
    }

    void (async () => {
      let latestAgentId: string | null = null;
      let latestArchivedAt = 0;
      try {
        const page = await fetchAgentHistoryPage({ client, serverId, cursor: null });
        for (const agent of page.agents) {
          if (agent.workspaceId !== workspaceId || !agent.archivedAt) {
            continue;
          }
          const archivedAt = agent.archivedAt.getTime();
          if (archivedAt > latestArchivedAt) {
            latestAgentId = agent.id;
            latestArchivedAt = archivedAt;
          }
        }
      } catch {
        toast.error(t("sidebar.workspace.toasts.loadArchivedAgentsFailed"));
        return;
      }

      if (!latestAgentId) {
        toast.error(t("sidebar.workspace.toasts.noArchivedAgent"));
        return;
      }

      navigateToWorkspace({
        serverId,
        workspaceId,
        target: { kind: "agent", agentId: latestAgentId },
      });
      try {
        await client.refreshAgent(latestAgentId);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("sidebar.workspace.toasts.restoreArchivedAgentFailed"),
        );
      }
    })();
  }, [serverId, workspaceId, t, toast]);
}
