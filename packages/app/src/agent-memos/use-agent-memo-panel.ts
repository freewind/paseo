import { useCallback, useState } from "react";
import type { TFunction } from "i18next";
import type { AgentMemo } from "@getpaseo/protocol/messages";
import type { ToastApi } from "@/components/toast-host";
import type { AgentInputDraft } from "@/composer/draft/input-draft";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import { appendMemoText, memoImagesToAttachments } from "./memo-append";
import { useAgentMemos } from "./use-agent-memos";

interface UseAgentMemoPanelInput {
  serverId: string;
  agentId: string;
  isCompactFormFactor: boolean;
  agentInputDraft: AgentInputDraft;
  toastApi: ToastApi;
  t: TFunction;
}

/**
 * 备忘面板在宿主侧的接线：是否支持、紧凑入口、弹层开关，以及「追加到输入框」和
 * 「把选中文字存成备忘」两个动作。抽成 hook 是为了让面板组件本身不背这些分支。
 */
export function useAgentMemoPanel({
  serverId,
  agentId,
  isCompactFormFactor,
  agentInputDraft,
  toastApi,
  t,
}: UseAgentMemoPanelInput) {
  const memosSupported = useHostFeature(serverId, "agentMemos");
  const hasMemosEntry = memosSupported && isCompactFormFactor;
  const [isMemosSheetOpen, setIsMemosSheetOpen] = useState(false);
  const openMemosSheet = useCallback(() => setIsMemosSheetOpen(true), []);
  const closeMemosSheet = useCallback(() => setIsMemosSheetOpen(false), []);

  const { setMemoCompleted } = useAgentMemos({ serverId, agentId });
  const markMemoCompleted = useCallback(
    (memoId: string) => setMemoCompleted(memoId, true),
    [setMemoCompleted],
  );

  const appendMemoToComposer = useCallback(
    async (entry: AgentMemo) => {
      const draftText = agentInputDraft.textSource.getSnapshot();
      agentInputDraft.replaceText(appendMemoText(draftText, entry.text));
      const metadata = await memoImagesToAttachments(entry.images).catch(() => []);
      if (metadata.length > 0) {
        const imageAttachments = metadata.map((item) => ({
          kind: "image" as const,
          metadata: item,
        }));
        agentInputDraft.setAttachments((previous) => [...previous, ...imageAttachments]);
      }
      if (entry.completed !== true) {
        void markMemoCompleted(entry.id).catch(() => undefined);
      }
    },
    [agentInputDraft, markMemoCompleted],
  );

  const addSelectionToMemo = useCallback(
    (blockText: string) => {
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toastApi.error(t("agentMemos.failedToAdd"));
        return;
      }
      client
        .addAgentMemo(agentId, blockText)
        .then((payload) => {
          // 添加的回复带全量列表；不回写，备忘在 daemon 上但这一端看不到。
          useSessionStore.getState().setAgentMemos(serverId, agentId, payload.memos);
          toastApi.show(t("agentMemos.addedToMemo"), { variant: "success" });
          return undefined;
        })
        .catch(() => toastApi.error(t("agentMemos.failedToAdd")));
    },
    [agentId, serverId, t, toastApi],
  );

  return {
    memosSupported,
    hasMemosEntry,
    isMemosSheetOpen,
    openMemosSheet,
    closeMemosSheet,
    appendMemoToComposer,
    addSelectionToMemo,
  };
}
