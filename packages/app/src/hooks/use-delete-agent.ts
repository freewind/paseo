import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useCallback, useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "@/stores/session-store";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "./agent-history-query-key";
import { removeAgentFromCachedLists } from "./use-archive-agent";

export const DELETE_AGENT_PENDING_QUERY_KEY = ["delete-agent-pending"] as const;
const EMPTY_PENDING_DELETE_AGENT_IDS = new Set<string>();

export interface DeleteAgentInput {
  serverId: string;
  agentId: string;
}

export type DeleteAgentPendingState = Record<string, true>;

interface SetAgentDeletingInput extends DeleteAgentInput {
  queryClient: QueryClient;
  isDeleting: boolean;
}

interface IsAgentDeletingInput extends DeleteAgentInput {
  queryClient: QueryClient;
}

export function toDeleteKey(input: DeleteAgentInput): string {
  const serverId = input.serverId.trim();
  const agentId = input.agentId.trim();
  if (!serverId || !agentId) {
    return "";
  }
  return `${serverId}:${agentId}`;
}

function readPendingState(queryClient: QueryClient): DeleteAgentPendingState {
  return queryClient.getQueryData<DeleteAgentPendingState>(DELETE_AGENT_PENDING_QUERY_KEY) ?? {};
}

function setAgentDeleting(input: SetAgentDeletingInput): void {
  const key = toDeleteKey(input);
  if (!key) {
    return;
  }

  input.queryClient.setQueryData<DeleteAgentPendingState>(
    DELETE_AGENT_PENDING_QUERY_KEY,
    (current) => {
      const state = current ?? {};
      if (input.isDeleting) {
        if (state[key]) {
          return state;
        }
        return { ...state, [key]: true };
      }

      if (!state[key]) {
        return state;
      }

      const next = { ...state };
      delete next[key];
      return next;
    },
  );
}

export function isAgentDeleting(input: IsAgentDeletingInput): boolean {
  const key = toDeleteKey(input);
  if (!key) {
    return false;
  }
  return readPendingState(input.queryClient)[key] ?? false;
}

/**
 * History entries hold an `AgentHistoryQueryAgent`; a delete removes the entry outright,
 * unlike archive which only stamps `archivedAt`.
 */
function removeAgentFromHistoryPayload<
  T extends { pages?: Array<{ agents?: unknown[] }> } | undefined,
>(payload: T, input: DeleteAgentInput): T {
  if (!payload || !Array.isArray(payload.pages) || !input.agentId) {
    return payload;
  }

  let changed = false;
  const pages = payload.pages.map((page) => {
    if (!Array.isArray(page.agents)) {
      return page;
    }

    const filtered = page.agents.filter((agent) => {
      const candidate = agent as { id?: string | null; serverId?: string | null } | null;
      if (candidate?.id !== input.agentId) {
        return true;
      }
      if (candidate.serverId != null && candidate.serverId !== input.serverId) {
        return true;
      }
      changed = true;
      return false;
    });
    if (filtered.length === page.agents.length) {
      return page;
    }
    return { ...page, agents: filtered };
  });

  return changed ? ({ ...payload, pages } as T) : payload;
}

function removeAgentFromHistoryCache(queryClient: QueryClient, input: DeleteAgentInput): void {
  queryClient.setQueryData(agentHistoryQueryKey(input.serverId), (current: unknown) =>
    removeAgentFromHistoryPayload(
      current as { pages?: Array<{ agents?: unknown[] }> } | undefined,
      input,
    ),
  );
  queryClient.setQueriesData({ queryKey: allAgentHistoryQueryRootKey() }, (current: unknown) =>
    removeAgentFromHistoryPayload(
      current as { pages?: Array<{ agents?: unknown[] }> } | undefined,
      input,
    ),
  );
}

function clearDeleteAgentPending(input: IsAgentDeletingInput): void {
  setAgentDeleting({
    ...input,
    isDeleting: false,
  });
}

interface DeleteAgentListCacheSnapshot {
  sidebarAgentsList: unknown;
  allAgents: unknown;
  agentHistory: unknown;
  allAgentHistory: Array<[QueryKey, unknown]>;
}

interface DeleteAgentMutationContext {
  agent: ReturnType<typeof getStoredAgentSnapshot>;
  lists: DeleteAgentListCacheSnapshot;
}

function getStoredAgentSnapshot(input: DeleteAgentInput) {
  return useSessionStore.getState().sessions[input.serverId]?.agents.get(input.agentId);
}

function restoreAgentSnapshot(
  input: DeleteAgentInput & { agent: ReturnType<typeof getStoredAgentSnapshot> },
): void {
  getHostRuntimeStore().restoreAgentSnapshot(input.serverId, input.agentId, input.agent);
}

function getDeleteAgentListCacheSnapshot(
  queryClient: QueryClient,
  serverId: string,
): DeleteAgentListCacheSnapshot {
  return {
    sidebarAgentsList: queryClient.getQueryData(["sidebarAgentsList", serverId]),
    allAgents: queryClient.getQueryData(["allAgents", serverId]),
    agentHistory: queryClient.getQueryData(agentHistoryQueryKey(serverId)),
    allAgentHistory: queryClient.getQueriesData({
      queryKey: allAgentHistoryQueryRootKey(),
    }),
  };
}

function restoreCachedQuerySnapshot(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  snapshot: unknown,
): void {
  if (snapshot === undefined) {
    queryClient.removeQueries({ queryKey, exact: true });
    return;
  }
  queryClient.setQueryData(queryKey, snapshot);
}

function restoreDeleteAgentListCacheSnapshot(
  queryClient: QueryClient,
  serverId: string,
  snapshot: DeleteAgentListCacheSnapshot,
): void {
  restoreCachedQuerySnapshot(
    queryClient,
    ["sidebarAgentsList", serverId],
    snapshot.sidebarAgentsList,
  );
  restoreCachedQuerySnapshot(queryClient, ["allAgents", serverId], snapshot.allAgents);
  restoreCachedQuerySnapshot(queryClient, agentHistoryQueryKey(serverId), snapshot.agentHistory);
  for (const [queryKey, querySnapshot] of snapshot.allAgentHistory) {
    restoreCachedQuerySnapshot(queryClient, queryKey, querySnapshot);
  }
}

function removeAgentFromStore(input: DeleteAgentInput): void {
  getHostRuntimeStore().restoreAgentSnapshot(input.serverId, input.agentId, undefined);
}

function useDeleteAgentPendingQuery() {
  return useQuery({
    queryKey: DELETE_AGENT_PENDING_QUERY_KEY,
    queryFn: async (): Promise<DeleteAgentPendingState> => ({}),
    initialData: {} as DeleteAgentPendingState,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function usePendingDeleteAgentIds(serverId: string): ReadonlySet<string> {
  const pendingQuery = useDeleteAgentPendingQuery();
  return useMemo(
    () => selectPendingDeleteAgentIds(pendingQuery.data ?? {}, serverId),
    [pendingQuery.data, serverId],
  );
}

function selectPendingDeleteAgentIds(
  pendingState: DeleteAgentPendingState,
  serverId: string,
): ReadonlySet<string> {
  const normalizedServerId = serverId.trim();
  if (!normalizedServerId) {
    return EMPTY_PENDING_DELETE_AGENT_IDS;
  }

  const prefix = `${normalizedServerId}:`;
  let agentIds: string[] | null = null;
  for (const key of Object.keys(pendingState)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const agentId = key.slice(prefix.length);
    if (!agentId) {
      continue;
    }
    agentIds ??= [];
    agentIds.push(agentId);
  }

  if (!agentIds || agentIds.length === 0) {
    return EMPTY_PENDING_DELETE_AGENT_IDS;
  }
  return new Set(agentIds);
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const pendingQuery = useDeleteAgentPendingQuery();

  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteAgentInput): Promise<void> => {
      const client = useSessionStore.getState().sessions[input.serverId]?.client ?? null;
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      await client.deleteAgent(input.agentId);
    },
    onMutate: (input) => {
      const context: DeleteAgentMutationContext = {
        agent: getStoredAgentSnapshot(input),
        lists: getDeleteAgentListCacheSnapshot(queryClient, input.serverId),
      };

      removeAgentFromCachedLists(queryClient, input);
      removeAgentFromHistoryCache(queryClient, input);
      removeAgentFromStore(input);
      setAgentDeleting({
        queryClient,
        serverId: input.serverId,
        agentId: input.agentId,
        isDeleting: true,
      });
      return context;
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
      restoreDeleteAgentListCacheSnapshot(queryClient, input.serverId, context.lists);
    },
    onSettled: (_result, _error, input) => {
      clearDeleteAgentPending({
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

  const deleteMutateAsync = deleteMutation.mutateAsync;

  const deleteAgent = useCallback(
    async (input: DeleteAgentInput): Promise<void> => {
      await deleteMutateAsync(input);
    },
    [deleteMutateAsync],
  );

  const isDeletingAgent = useCallback(
    (input: DeleteAgentInput): boolean => {
      const key = toDeleteKey(input);
      if (!key) {
        return false;
      }
      return (pendingQuery.data ?? {})[key] ?? false;
    },
    [pendingQuery.data],
  );

  return {
    deleteAgent,
    isDeletingAgent,
  };
}
