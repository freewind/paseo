import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "./agent-history-query-key";

/**
 * "归档"与"彻底删除"共用的一套状态机：两者在列表缓存、历史缓存与进行中标记上做的事几乎一样，
 * 只有「把记录标成已归档」还是「直接清掉」这一步不同。谁用谁传入自己的 pending key 与模式。
 */

export interface AgentLifecycleKeyInput {
  serverId: string;
  agentId: string;
}

export type AgentPendingState = Record<string, true>;

export interface AgentsListQueryData {
  entries?: Array<{ agent?: { id?: string | null } | null } | null>;
}

export interface AgentHistoryQueryAgent {
  id?: string | null;
  serverId?: string | null;
  archivedAt?: Date | null;
}

export interface AgentHistoryQueryPage {
  agents?: AgentHistoryQueryAgent[];
}

export interface AgentHistoryQueryData {
  pages?: AgentHistoryQueryPage[];
}

interface SetAgentPendingInput extends AgentLifecycleKeyInput {
  queryClient: QueryClient;
  pending: boolean;
}

interface IsAgentPendingInput extends AgentLifecycleKeyInput {
  queryClient: QueryClient;
}

export function toAgentKey(input: AgentLifecycleKeyInput): string {
  const serverId = input.serverId.trim();
  const agentId = input.agentId.trim();
  if (!serverId || !agentId) {
    return "";
  }
  return `${serverId}:${agentId}`;
}

export function selectPendingAgentIds(
  pendingState: AgentPendingState,
  serverId: string,
): ReadonlySet<string> {
  const normalizedServerId = serverId.trim();
  if (!normalizedServerId) {
    return EMPTY_PENDING_AGENT_IDS;
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
    return EMPTY_PENDING_AGENT_IDS;
  }
  return new Set(agentIds);
}

const EMPTY_PENDING_AGENT_IDS = new Set<string>();

export interface AgentPendingStateStore {
  readonly queryKey: QueryKey;
  read(queryClient: QueryClient): AgentPendingState;
  set(input: SetAgentPendingInput): void;
  is(input: IsAgentPendingInput): boolean;
}

export function createAgentPendingStateStore(queryKey: QueryKey): AgentPendingStateStore {
  const read = (queryClient: QueryClient): AgentPendingState =>
    queryClient.getQueryData<AgentPendingState>(queryKey) ?? {};

  const set = (input: SetAgentPendingInput): void => {
    const key = toAgentKey(input);
    if (!key) {
      return;
    }

    input.queryClient.setQueryData<AgentPendingState>(queryKey, (current) => {
      const state = current ?? {};
      if (input.pending) {
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
    });
  };

  const is = (input: IsAgentPendingInput): boolean => {
    const key = toAgentKey(input);
    if (!key) {
      return false;
    }
    return read(input.queryClient)[key] ?? false;
  };

  return { queryKey, read, set, is };
}

export function removeAgentFromListPayload<T extends AgentsListQueryData | undefined>(
  payload: T,
  agentId: string,
): T {
  if (!payload || !Array.isArray(payload.entries) || !agentId) {
    return payload;
  }
  const filtered = payload.entries.filter((entry) => entry?.agent?.id !== agentId);
  if (filtered.length === payload.entries.length) {
    return payload;
  }
  return {
    ...payload,
    entries: filtered,
  } as T;
}

export function removeAgentFromCachedLists(
  queryClient: QueryClient,
  input: AgentLifecycleKeyInput,
): void {
  const agentId = input.agentId.trim();
  if (!agentId) {
    return;
  }

  queryClient.setQueryData<AgentsListQueryData | undefined>(
    ["sidebarAgentsList", input.serverId],
    (current) => removeAgentFromListPayload(current, agentId),
  );
  queryClient.setQueryData<AgentsListQueryData | undefined>(
    ["allAgents", input.serverId],
    (current) => removeAgentFromListPayload(current, agentId),
  );
}

export function markAgentArchivedInHistoryPayload<T extends AgentHistoryQueryData | undefined>(
  payload: T,
  input: AgentLifecycleKeyInput & { archivedAt: string },
): T {
  if (!payload || !Array.isArray(payload.pages) || !input.agentId) {
    return payload;
  }

  const archivedAt = new Date(input.archivedAt);
  if (Number.isNaN(archivedAt.getTime())) {
    return payload;
  }

  let changed = false;
  const pages = payload.pages.map((page) => {
    if (!Array.isArray(page.agents)) {
      return page;
    }

    let pageChanged = false;
    const agents = page.agents.map((agent) => {
      if (
        agent.id !== input.agentId ||
        (agent.serverId != null && agent.serverId !== input.serverId)
      ) {
        return agent;
      }
      pageChanged = true;
      changed = true;
      return {
        ...agent,
        archivedAt,
      };
    });

    return pageChanged ? { ...page, agents } : page;
  });

  return changed ? ({ ...payload, pages } as T) : payload;
}

export function markAgentArchivedInHistoryCache(
  queryClient: QueryClient,
  input: AgentLifecycleKeyInput & { archivedAt: string },
): void {
  queryClient.setQueryData<AgentHistoryQueryData | undefined>(
    agentHistoryQueryKey(input.serverId),
    (current) => markAgentArchivedInHistoryPayload(current, input),
  );
  queryClient.setQueriesData<AgentHistoryQueryData | undefined>(
    { queryKey: allAgentHistoryQueryRootKey() },
    (current) => markAgentArchivedInHistoryPayload(current, input),
  );
}

export interface AgentCacheSnapshot {
  sidebarAgentsList: AgentsListQueryData | undefined;
  allAgents: AgentsListQueryData | undefined;
  agentHistory: AgentHistoryQueryData | undefined;
  allAgentHistory: Array<[QueryKey, AgentHistoryQueryData | undefined]>;
}

export function getAgentCacheSnapshot(
  queryClient: QueryClient,
  serverId: string,
): AgentCacheSnapshot {
  return {
    sidebarAgentsList: queryClient.getQueryData<AgentsListQueryData | undefined>([
      "sidebarAgentsList",
      serverId,
    ]),
    allAgents: queryClient.getQueryData<AgentsListQueryData | undefined>(["allAgents", serverId]),
    agentHistory: queryClient.getQueryData<AgentHistoryQueryData | undefined>(
      agentHistoryQueryKey(serverId),
    ),
    allAgentHistory: queryClient.getQueriesData<AgentHistoryQueryData | undefined>({
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

export function restoreAgentCacheSnapshot(
  queryClient: QueryClient,
  serverId: string,
  snapshot: AgentCacheSnapshot,
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

export function markAgentArchivedInStore(
  input: AgentLifecycleKeyInput & { archivedAt: string },
): void {
  const archivedAt = new Date(input.archivedAt);
  if (Number.isNaN(archivedAt.getTime())) {
    return;
  }

  getHostRuntimeStore().archiveAgentSnapshot(
    input.serverId,
    input.agentId,
    archivedAt.toISOString(),
  );
}

export function getStoredAgentSnapshot(input: AgentLifecycleKeyInput) {
  return useSessionStore.getState().sessions[input.serverId]?.agents.get(input.agentId);
}

export function restoreAgentSnapshot(
  input: AgentLifecycleKeyInput & { agent: ReturnType<typeof getStoredAgentSnapshot> },
): void {
  getHostRuntimeStore().restoreAgentSnapshot(input.serverId, input.agentId, input.agent);
}
