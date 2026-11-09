import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { AgentMemo, ImageAttachment } from "@getpaseo/protocol/messages";
import { useSessionStore } from "@/stores/session-store";
import { getHostRuntimeStore } from "@/runtime/host-runtime";

/**
 * 一个 agent 的服务端备忘。
 *
 * 列表存在 session store，由每次 RPC 的全量回复喂；每个变更都回权威列表，
 * 客户端按替换对齐；没发变更的客户端在下一次 agent 拉取时看到变化。

 *
 * 打开目录里已知的会话不会再拉 agent，而备忘只随那次拉取返回，所以第一个 mount 的
 * rail 主动问一次。已问过的 key 集合保证每个 agent 每次运行只问一次；失败则忘掉 key，
 * 重连后还能再试。
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
  clearCompletedMemos: () => Promise<void>;
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
    // 按能力位放行：老宿主不会回 `memos`，问了只是噪音。
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
        // 回复里没有这个字段，说明宿主从不发列表，不用再问。
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

  // 一次删一条、按列表顺序：每条回复都带全量列表，并行删除会乱序，最后到的回复才生效。
  const removeMemosWhere = useCallback(
    async (shouldRemove: (memo: AgentMemo) => boolean) => {
      if (!agentId) return;
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) return;
      const current = useSessionStore.getState().sessions[serverId]?.agentMemos.get(agentId) ?? [];
      for (const memo of current) {
        if (!shouldRemove(memo)) continue;
        const payload = await client.deleteAgentMemo(agentId, memo.id);
        useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
      }
    },
    [agentId, serverId],
  );

  const clearMemos = useCallback(() => removeMemosWhere(() => true), [removeMemosWhere]);
  const clearCompletedMemos = useCallback(
    () => removeMemosWhere((memo) => memo.completed === true),
    [removeMemosWhere],
  );

  return {
    memos,
    addMemo,
    updateMemo,
    setMemoCompleted,
    deleteMemo,
    clearMemos,
    clearCompletedMemos,
  };
}

const EMPTY_MEMOS: readonly AgentMemo[] = [];
