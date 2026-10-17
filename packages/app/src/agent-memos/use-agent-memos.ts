import { useCallback, useSyncExternalStore } from "react";
import type { AgentMemo } from "@getpaseo/protocol/messages";
import { useSessionStore } from "@/stores/session-store";
import { getHostRuntimeStore } from "@/runtime/host-runtime";

/**
 * Server-stored memos for one agent.
 *
 * The list lives in the session store, fed by each memo RPC's full-list reply. Every
 * mutation returns the authoritative list, so all clients reconcile by replacement;
 * clients that did not issue the mutation see the change on their next agent fetch.
 */
export function useAgentMemos(input: {
  serverId: string | null | undefined;
  agentId: string | null | undefined;
}): {
  memos: readonly AgentMemo[];
  addMemo: (text: string) => Promise<void>;
  updateMemo: (memoId: string, text: string) => Promise<void>;
  deleteMemo: (memoId: string) => Promise<void>;
} {
  const serverId = input.serverId ?? "";
  const agentId = input.agentId ?? "";
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      useSessionStore.subscribe((state, previous) => {
        if (
          state.sessions[serverId]?.agentMemos.get(agentId) !==
          previous.sessions[serverId]?.agentMemos.get(agentId)
        ) {
          onStoreChange();
        }
      }),
    [agentId, serverId],
  );
  const getSnapshot = useCallback(
    () => useSessionStore.getState().sessions[serverId]?.agentMemos.get(agentId) ?? EMPTY_MEMOS,
    [agentId, serverId],
  );
  const memos = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const addMemo = useCallback(
    async (text: string) => {
      if (!agentId) throw new Error("Memo: agent unavailable");
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("Memo: daemon client unavailable");
      const payload = await client.addAgentMemo(agentId, text);
      useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
    },
    [agentId, serverId],
  );

  const updateMemo = useCallback(
    async (memoId: string, text: string) => {
      if (!agentId) throw new Error("Memo: agent unavailable");
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("Memo: daemon client unavailable");
      const payload = await client.updateAgentMemo(agentId, memoId, text);
      useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
    },
    [agentId, serverId],
  );

  const deleteMemo = useCallback(
    async (memoId: string) => {
      if (!agentId) throw new Error("Memo: agent unavailable");
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("Memo: daemon client unavailable");
      const payload = await client.deleteAgentMemo(agentId, memoId);
      useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
    },
    [agentId, serverId],
  );

  return { memos, addMemo, updateMemo, deleteMemo };
}

const EMPTY_MEMOS: readonly AgentMemo[] = [];
