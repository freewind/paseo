import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "./agent-history-query-key";
import {
  createAgentPendingStateStore,
  getAgentCacheSnapshot,
  removeAgentFromCachedLists,
  removeAgentFromHistoryCache,
  restoreAgentCacheSnapshot,
  type AgentCacheSnapshot,
  type AgentLifecycleKeyInput,
} from "./agent-lifecycle-cache";

export type DeleteAgentInput = AgentLifecycleKeyInput;

const deletePending = createAgentPendingStateStore(["delete-agent-pending"]);

/** 记录删掉后，所有指向它的标签也要一起关掉，否则标签会指向一个不存在的 agent。 */
function closeTabsForAgent(agentId: string): void {
  const layout = useWorkspaceLayoutStore.getState();
  for (const workspaceKey of Object.keys(layout.layoutByWorkspace)) {
    for (const tab of layout.getWorkspaceTabs(workspaceKey)) {
      if (tab.target.kind === "agent" && tab.target.agentId === agentId) {
        layout.closeTab(workspaceKey, tab.tabId);
      }
    }
  }
}

interface DeleteAgentMutationContext {
  lists: AgentCacheSnapshot;
}

/** 乐观删除：列表与历史缓存里立刻移除，失败时用快照整体恢复。 */
export function applyDeleteAgentOptimistic(input: {
  queryClient: QueryClient;
  serverId: string;
  agentId: string;
}): DeleteAgentMutationContext {
  const context: DeleteAgentMutationContext = {
    lists: getAgentCacheSnapshot(input.queryClient, input.serverId),
  };
  removeAgentFromCachedLists(input.queryClient, input);
  removeAgentFromHistoryCache(input.queryClient, input);
  return context;
}

export function restoreDeleteAgentOptimistic(input: {
  queryClient: QueryClient;
  serverId: string;
  context: DeleteAgentMutationContext;
}): void {
  restoreAgentCacheSnapshot(input.queryClient, input.serverId, input.context.lists);
}

function invalidateAgentQueries(queryClient: QueryClient, serverId: string): void {
  void queryClient.invalidateQueries({ queryKey: ["sidebarAgentsList", serverId] });
  void queryClient.invalidateQueries({ queryKey: ["allAgents", serverId] });
  void queryClient.invalidateQueries({ queryKey: agentHistoryQueryKey(serverId) });
  void queryClient.invalidateQueries({ queryKey: allAgentHistoryQueryRootKey() });
}

/**
 * 彻底删除：先确认（不可逆，且会连 provider 自己的会话文件一起删），再删记录与缓存，
 * 失败时恢复缓存快照。入口只决定位置，确认文案与提示都留在这里。
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteAgentInput): Promise<void> => {
      const client = useSessionStore.getState().sessions[input.serverId]?.client ?? null;
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      await client.deleteAgent(input.agentId);
    },
    onMutate: (input) => {
      const context = applyDeleteAgentOptimistic({ queryClient, ...input });
      deletePending.set({ ...input, queryClient, pending: true });
      return context;
    },
    onSuccess: (_result, input) => {
      closeTabsForAgent(input.agentId);
    },
    onError: (_error, input, context) => {
      if (context) restoreDeleteAgentOptimistic({ queryClient, ...input, context });
    },
    onSettled: (_result, _error, input) => {
      deletePending.set({ ...input, queryClient, pending: false });
      invalidateAgentQueries(queryClient, input.serverId);
    },
  });

  const deleteMutateAsync = deleteMutation.mutateAsync;

  const deleteAgent = useCallback(
    async (input: DeleteAgentInput): Promise<void> => {
      const agent =
        useSessionStore.getState().sessions[input.serverId]?.agents.get(input.agentId) ?? null;
      const confirmed = await confirmDialog({
        title: t("agentList.deleteSheet.confirmTitle"),
        message: t("agentList.deleteSheet.confirmMessage", {
          agent: agent?.title ?? input.agentId,
        }),
        confirmLabel: t("agentList.deleteSheet.delete"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteMutateAsync(input);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("agentList.deleteSheet.failed"));
      }
    },
    [deleteMutateAsync, t, toast],
  );

  return {
    deleteAgent,
    isDeletingAgent: deleteMutation.isPending,
  };
}

/** 供调用方判断这条 agent 是否正处在删除中（灰掉菜单项）。 */
export function isAgentDeleting(input: {
  queryClient: QueryClient;
  serverId: string;
  agentId: string;
}): boolean {
  return deletePending.is(input);
}
