import { useCallback } from "react";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";

export interface UseQuickRepliesResult {
  replies: QuickReply[];
  /** 老 daemon 还没有这个能力，或连接断开时，为 false。 */
  isSupported: boolean;
  /** 整份写回：daemon 配置才是跨端的唯一来源。 */
  saveReplies: (next: QuickReply[]) => Promise<void>;
}

/** 连上的 daemon 还不认识常用回复时，各处入口都不该出现。 */
export function useIsQuickRepliesSupported(serverId: string | null): boolean {
  return useSessionStore(
    (state) => state.sessions[serverId ?? ""]?.serverInfo?.features?.quickReplies === true,
  );
}

export function useQuickReplies(serverId: string | null): UseQuickRepliesResult {
  const { config, patchConfig } = useDaemonConfig(serverId);
  const isSupported = useIsQuickRepliesSupported(serverId);

  const saveReplies = useCallback(
    async (next: QuickReply[]) => {
      await patchConfig({ quickReplies: next });
    },
    [patchConfig],
  );

  return {
    replies: config?.quickReplies ?? [],
    isSupported,
    saveReplies,
  };
}
