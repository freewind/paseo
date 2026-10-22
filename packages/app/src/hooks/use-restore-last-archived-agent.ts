import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore, type Agent } from "@/stores/session-store";

/**
 * Restores the agent archived most recently inside one workspace, and opens it.
 *
 * Archived agents stay in the session's agent map, so the newest one is found locally — no RPC to
 * list them. Restoring is the same call the agent panel's Unarchive button makes: the daemon
 * unarchives the record and brings the session back.
 */
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
      // The refreshed agent keeps its id, so the tab can be opened before the snapshot lands.
      navigateToWorkspace({
        serverId,
        workspaceId,
        target: { kind: "agent", agentId: latest.id },
      });
    })();
  }, [serverId, t, toast, workspaceId]);
}

function findLatestArchivedAgent(input: {
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
