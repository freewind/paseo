import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "./agent-history-query-key";
import {
  createAgentPendingStateStore,
  getAgentCacheSnapshot,
  getStoredAgentSnapshot,
  markAgentArchivedInHistoryCache,
  markAgentArchivedInStore,
  removeAgentFromCachedLists,
  restoreAgentCacheSnapshot,
  restoreAgentSnapshot,
  selectPendingAgentIds,
  toAgentKey,
  type AgentCacheSnapshot,
  type AgentLifecycleKeyInput,
  type AgentPendingState,
} from "./agent-lifecycle-cache";
import { useSessionStore } from "@/stores/session-store";

// 这两个转发块保留了旧导出名：`use-archive-agent.test.ts`、`agent-replica.ts`、
// `internal/agent-store.ts` 仍从这个路径 import，换成新模块路径它们得全部改一遍。
// 下面的实现已搬到 `agent-lifecycle-cache`，这里只负责转手。
export type {
  AgentHistoryQueryAgent,
  AgentHistoryQueryData,
  AgentHistoryQueryPage,
  AgentsListQueryData,
} from "./agent-lifecycle-cache";
export {
  markAgentArchivedInHistoryCache,
  markAgentArchivedInHistoryPayload,
  removeAgentFromCachedLists,
  removeAgentFromListPayload,
} from "./agent-lifecycle-cache";

type ArchiveAgentInput = AgentLifecycleKeyInput;
type ArchiveAgentPendingState = AgentPendingState;

const archivePending = createAgentPendingStateStore(["archive-agent-pending"]);

export const ARCHIVE_AGENT_PENDING_QUERY_KEY = archivePending.queryKey;

export function toArchiveKey(input: ArchiveAgentInput): string {
  return toAgentKey(input);
}

export function readPendingState(queryClient: QueryClient): ArchiveAgentPendingState {
  return archivePending.read(queryClient);
}

export function selectPendingArchiveAgentIds(
  pendingState: ArchiveAgentPendingState,
  serverId: string,
): ReadonlySet<string> {
  return selectPendingAgentIds(pendingState, serverId);
}

export function setAgentArchiving(input: {
  queryClient: QueryClient;
  serverId: string;
  agentId: string;
  isArchiving: boolean;
}): void {
  archivePending.set({
    queryClient: input.queryClient,
    serverId: input.serverId,
    agentId: input.agentId,
    pending: input.isArchiving,
  });
}

export function isAgentArchiving(input: {
  queryClient: QueryClient;
  serverId: string;
  agentId: string;
}): boolean {
  return archivePending.is(input);
}

export function clearArchiveAgentPending(input: {
  queryClient: QueryClient;
  serverId: string;
  agentId: string;
}): void {
  setAgentArchiving({ ...input, isArchiving: false });
}

export interface ArchivedAgentCloseResult {
  agentId: string;
  archivedAt: string;
}

interface ArchiveAgentMutationContext {
  agent: ReturnType<typeof getStoredAgentSnapshot>;
  lists: AgentCacheSnapshot;
}

interface ApplyArchivedAgentCloseResultsInput {
  queryClient: QueryClient;
  serverId: string;
  results: ArchivedAgentCloseResult[];
  invalidateQueries?: boolean;
}

export function applyArchivedAgentCloseResults(input: ApplyArchivedAgentCloseResultsInput): void {
  if (input.results.length === 0) {
    return;
  }

  for (const result of input.results) {
    markAgentArchivedInStore({
      serverId: input.serverId,
      agentId: result.agentId,
      archivedAt: result.archivedAt,
    });
    removeAgentFromCachedLists(input.queryClient, {
      serverId: input.serverId,
      agentId: result.agentId,
    });
    markAgentArchivedInHistoryCache(input.queryClient, {
      serverId: input.serverId,
      agentId: result.agentId,
      archivedAt: result.archivedAt,
    });
  }

  if (input.invalidateQueries ?? true) {
    void input.queryClient.invalidateQueries({
      queryKey: ["sidebarAgentsList", input.serverId],
    });
    void input.queryClient.invalidateQueries({
      queryKey: ["allAgents", input.serverId],
    });
    void input.queryClient.invalidateQueries({
      queryKey: agentHistoryQueryKey(input.serverId),
    });
    void input.queryClient.invalidateQueries({
      queryKey: allAgentHistoryQueryRootKey(),
    });
  }
}

// 归档相关的三个 hook 都留在本文件：它们共享同一份 pending 查询与缓存同步逻辑，拆开就要
// 多传好几层参数，不如放一起。
function useArchiveAgentPendingQuery() {
  return useQuery({
    queryKey: ARCHIVE_AGENT_PENDING_QUERY_KEY,
    queryFn: async (): Promise<ArchiveAgentPendingState> => ({}),
    initialData: {} as ArchiveAgentPendingState,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function usePendingArchiveAgentKeys(): ReadonlySet<string> {
  const pendingQuery = useArchiveAgentPendingQuery();
  return useMemo(() => new Set(Object.keys(pendingQuery.data ?? {})), [pendingQuery.data]);
}

export function usePendingArchiveAgentIds(serverId: string): ReadonlySet<string> {
  const pendingQuery = useArchiveAgentPendingQuery();
  return useMemo(
    () => selectPendingAgentIds(pendingQuery.data ?? {}, serverId),
    [pendingQuery.data, serverId],
  );
}

export function useArchiveAgent() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const archiveMutation = useMutation({
    mutationFn: async (input: ArchiveAgentInput): Promise<{ archivedAt: string }> => {
      const client = useSessionStore.getState().sessions[input.serverId]?.client ?? null;
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      return await client.archiveAgent(input.agentId);
    },
    onMutate: (input) => {
      const context: ArchiveAgentMutationContext = {
        agent: getStoredAgentSnapshot(input),
        lists: getAgentCacheSnapshot(queryClient, input.serverId),
      };
      const archivedAt = new Date().toISOString();

      applyArchivedAgentCloseResults({
        queryClient,
        serverId: input.serverId,
        results: [{ agentId: input.agentId, archivedAt }],
        invalidateQueries: false,
      });
      setAgentArchiving({
        queryClient,
        serverId: input.serverId,
        agentId: input.agentId,
        isArchiving: true,
      });
      return context;
    },
    onSuccess: (result, input) => {
      markAgentArchivedInStore({
        serverId: input.serverId,
        agentId: input.agentId,
        archivedAt: result.archivedAt,
      });
    },
    onError: (_error, input, context) => {
      if (!context) {
        return;
      }
      restoreAgentSnapshot({
        serverId: input.serverId,
        agentId: input.agentId,
        agent: context.agent,
      });
      restoreAgentCacheSnapshot(queryClient, input.serverId, context.lists);
    },
    onSettled: (_result, _error, input) => {
      clearArchiveAgentPending({
        queryClient,
        serverId: input.serverId,
        agentId: input.agentId,
      });
      void queryClient.invalidateQueries({
        queryKey: ["sidebarAgentsList", input.serverId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["allAgents", input.serverId],
      });
      void queryClient.invalidateQueries({
        queryKey: agentHistoryQueryKey(input.serverId),
      });
      void queryClient.invalidateQueries({
        queryKey: allAgentHistoryQueryRootKey(),
      });
    },
  });

  const archiveMutateAsync = archiveMutation.mutateAsync;

  const archiveAgent = useCallback(
    async (input: ArchiveAgentInput): Promise<void> => {
      await archiveMutateAsync(input);
    },
    [archiveMutateAsync],
  );

  const isArchivingAgent = useCallback(
    (input: ArchiveAgentInput): boolean => isAgentArchiving({ queryClient, ...input }),
    [queryClient],
  );

  return {
    archiveAgent,
    isArchivingAgent,
  };
}
