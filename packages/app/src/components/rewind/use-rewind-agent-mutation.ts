import { planTimelineTailFetch } from "@/timeline/timeline-sync-plan";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/contexts/toast-context";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { AttachmentMetadata } from "@/attachments/types";
import type { RewindMode } from "./use-rewind-capabilities";
import { useRewindComposerRestore } from "./composer-restore";
import { useSessionStore } from "@/stores/session-store";
import { shouldRestoreComposerForRewindMode } from "./rewind-mode";
import { getHostRuntimeStore } from "@/runtime/host-runtime";

interface UseRewindAgentMutationInput {
  serverId?: string;
  agentId?: string;
  messageId?: string;
  client?: DaemonClient | null;
}

interface RewindAgentInput {
  mode: RewindMode;
  rewoundText: string;
  /** 被回退那条消息的附件，回退成功后放回输入框。 */
  images?: AttachmentMetadata[];
  attachments?: AgentAttachment[];
  /** 重新回答专用：回退已落盘后，时间线刷新失败不再阻断自动重发。 */
  ignoreTimelineRefreshFailure?: boolean;
}

export function useRewindAgentMutation(input: UseRewindAgentMutationInput): {
  rewindAgent: (input: RewindAgentInput) => Promise<void>;
  isPending: boolean;
} {
  const toast = useToast();
  const { t } = useTranslation();
  const composerRestore = useRewindComposerRestore();
  const { isPending, mutateAsync } = useMutation({
    mutationFn: async ({ mode, ignoreTimelineRefreshFailure }: RewindAgentInput) => {
      if (!input.client || !input.agentId || !input.messageId) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      await input.client.rewindAgent(input.agentId, input.messageId, mode);
      if (mode !== "files") {
        const cursor = input.serverId
          ? useSessionStore
              .getState()
              .sessions[input.serverId]?.agentTimelineCursor.get(input.agentId)
          : undefined;
        if (!input.serverId) throw new Error(t("common.errors.daemonClientUnavailable"));
        try {
          await getHostRuntimeStore().fetchAgentTimeline(input.serverId, input.agentId, {
            ...planTimelineTailFetch(),
            ...(cursor ? { cursor: { epoch: cursor.epoch, seq: cursor.endSeq } } : {}),
          });
        } catch (error) {
          if (!ignoreTimelineRefreshFailure) throw error;
          console.warn("重新回答：回退后时间线刷新失败", error);
        }
      }
    },
    onSuccess: (_data, variables) => {
      if (!shouldRestoreComposerForRewindMode(variables.mode)) {
        return;
      }
      composerRestore?.completeRewind({
        text: variables.rewoundText,
        images: variables.images,
        attachments: variables.attachments,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("rewind.errors.failed"));
    },
  });

  const rewindAgent = useCallback(
    async (rewindInput: RewindAgentInput) => {
      if (isPending) {
        return;
      }
      await mutateAsync(rewindInput);
    },
    [isPending, mutateAsync],
  );

  return {
    rewindAgent,
    isPending,
  };
}
