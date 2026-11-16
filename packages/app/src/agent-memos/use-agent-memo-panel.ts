import { useCallback, useState, useSyncExternalStore } from "react";
import type { TFunction } from "i18next";
import type { AgentMemo } from "@getpaseo/protocol/messages";
import type { ToastApi } from "@/components/toast-host";
import type { AgentInputDraft } from "@/composer/draft/input-draft";
import { encodeAttachmentsForSend } from "@/attachments/service";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import { appendMemoText, memoImagesToAttachments } from "./memo-append";
import type { AttachmentMetadata } from "@/attachments/types";
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
 * 备忘面板在宿主侧的接线：是否支持、紧凑入口、弹层开关，以及「追加到输入框」、
 * 「把选中文字存成备忘」和「从输入框创建备忘」三个动作。抽成 hook 是为了让面板
 * 组件本身不背这些分支。
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

  const { addMemo, setMemoCompleted } = useAgentMemos({ serverId, agentId });
  const markMemoCompleted = useCallback(
    (memoId: string) => setMemoCompleted(memoId, true),
    [setMemoCompleted],
  );

  const readComposerContent = useCallback(
    () => ({
      text: agentInputDraft.textSource.getSnapshot(),
      images: agentInputDraft.attachments.flatMap((attachment) =>
        attachment.kind === "image" ? [attachment.metadata] : [],
      ),
    }),
    [agentInputDraft],
  );
  const hasComposerContent = useCallback(() => {
    const { text, images } = readComposerContent();
    return text.trim().length > 0 || images.length > 0;
  }, [readComposerContent]);
  const canCreateFromComposer = useSyncExternalStore(
    agentInputDraft.textSource.subscribe,
    hasComposerContent,
    hasComposerContent,
  );

  const createMemoFromComposer = useCallback(async () => {
    const { text, images: imageMetadata } = readComposerContent();
    if (text.trim().length === 0 && imageMetadata.length === 0) return;

    let encodedImages: Array<{ data: string; mimeType: string }> | undefined;
    try {
      encodedImages = await encodeAttachmentsForSend(imageMetadata);
    } catch {
      toastApi.error(t("agentMemos.failedToEncodeImages"));
      return;
    }
    // 上游编码函数会静默丢掉编码失败的附件，张数对不上就不能生成缺图备忘。
    if ((encodedImages?.length ?? 0) !== imageMetadata.length) {
      toastApi.error(t("agentMemos.failedToEncodeImages"));
      return;
    }

    try {
      await addMemo(text, encodedImages);
    } catch {
      toastApi.error(t("agentMemos.failedToAdd"));
      return;
    }
    agentInputDraft.clear("sent");
    // clear 只清草稿 store；原生输入框靠 textReplacement 同步，必须再发布一次空文本。
    agentInputDraft.replaceText("");
    toastApi.show(t("agentMemos.addedToMemo"), { variant: "success" });
  }, [addMemo, agentInputDraft, readComposerContent, t, toastApi]);

  const appendMemoToComposer = useCallback(
    async (entry: AgentMemo) => {
      const draftText = agentInputDraft.textSource.getSnapshot();
      agentInputDraft.replaceText(appendMemoText(draftText, entry.text));
      let metadata: AttachmentMetadata[];
      try {
        metadata = await memoImagesToAttachments(entry.images);
      } catch {
        toastApi.error(t("agentMemos.failedToRestoreImages"));
        return;
      }
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
    [agentInputDraft, markMemoCompleted, t, toastApi],
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
    createMemoFromComposer,
    canCreateFromComposer,
  };
}
