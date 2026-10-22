import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { AgentMemo, ImageAttachment } from "@getpaseo/protocol/messages";
import { useSessionStore } from "@/stores/session-store";
import { getHostRuntimeStore } from "@/runtime/host-runtime";

/**
 * Server-stored memos for one agent.
 *
 * The list lives in the session store, fed by each memo RPC's full-list reply. Every
 * mutation returns the authoritative list, so all clients reconcile by replacement;
 * clients that did not issue the mutation see the change on their next agent fetch.
 *
 * Opening a session the directory already knows does not fetch the agent, and memos only
 * ride that fetch — so the first rail to mount asks once. The key set keeps it to one
 * request per agent per run; a failure forgets the key so a reconnect can try again.
 */
const memoFetchKeys = new Set<string>();
export function useAgentMemos(input: {
  serverId: string | null | undefined;
  agentId: string | null | undefined;
}): {
  memos: readonly AgentMemo[];
  addMemo: (text: string, images?: readonly ImageAttachment[]) => Promise<void>;
  updateMemo: (memoId: string, text: string, images?: readonly ImageAttachment[]) => Promise<void>;
  setMemoCompleted: (memoId: string, completed: boolean) => Promise<void>;
  deleteMemo: (memoId: string) => Promise<void>;
  clearMemos: () => Promise<void>;
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

  useEffect(() => {
    if (!serverId || !agentId) {
      return;
    }
    const key = `${serverId}:${agentId}`;
    if (memoFetchKeys.has(key)) {
      return;
    }
    const client = getHostRuntimeStore().getClient(serverId);
    // Gate on the feature: an older host answers without `memos`, and asking it would be noise.
    if (!client || client.getLastServerInfoMessage()?.features?.agentMemos !== true) {
      return;
    }
    if (useSessionStore.getState().sessions[serverId]?.agentMemos.has(agentId)) {
      return;
    }
    memoFetchKeys.add(key);
    void client
      .fetchAgent({ agentId })
      .then((result) => {
        const fetched = result?.memos;
        if (fetched) {
          useSessionStore.getState().setAgentMemos(serverId, agentId, fetched);
        }
        // A reply without the field means this host never sends lists; stop asking.
        return undefined;
      })
      .catch(() => {
        memoFetchKeys.delete(key);
      });
  }, [agentId, serverId]);

  const addMemo = useCallback(
    async (text: string, images?: readonly ImageAttachment[]) => {
      if (!agentId) throw new Error("Memo: agent unavailable");
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("Memo: daemon client unavailable");
      const payload = await client.addAgentMemo(agentId, text, images);
      useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
    },
    [agentId, serverId],
  );

  const updateMemo = useCallback(
    async (memoId: string, text: string, images?: readonly ImageAttachment[]) => {
      if (!agentId) throw new Error("Memo: agent unavailable");
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("Memo: daemon client unavailable");
      const payload = await client.updateAgentMemo(agentId, memoId, text, images);
      useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
    },
    [agentId, serverId],
  );

  const setMemoCompleted = useCallback(
    async (memoId: string, completed: boolean) => {
      if (!agentId) throw new Error("Memo: agent unavailable");
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) throw new Error("Memo: daemon client unavailable");
      const payload = await client.setAgentMemoCompleted(agentId, memoId, completed);
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

  // One delete at a time, in list order: every reply carries the whole list, so parallel deletes
  // would land out of order and the last reply to arrive would be the one that wins.
  const clearMemos = useCallback(async () => {
    if (!agentId) return;
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) return;
    const current = useSessionStore.getState().sessions[serverId]?.agentMemos.get(agentId) ?? [];
    for (const memo of current) {
      const payload = await client.deleteAgentMemo(agentId, memo.id);
      useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
    }
  }, [agentId, serverId]);

  return { memos, addMemo, updateMemo, setMemoCompleted, deleteMemo, clearMemos };
}

const EMPTY_MEMOS: readonly AgentMemo[] = [];
