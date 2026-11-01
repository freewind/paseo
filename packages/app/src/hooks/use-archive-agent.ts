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

export type ArchiveAgentInput = AgentLifecycleKeyInput;
export type ArchiveAgentPendingState = AgentPendingState;

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
