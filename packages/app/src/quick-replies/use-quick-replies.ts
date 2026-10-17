import { useCallback } from "react";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";

export interface UseQuickRepliesResult {
  replies: QuickReply[];
  /** False on daemons that predate quick replies, or while disconnected. */
  isSupported: boolean;
  /** Writes the whole list; the daemon config is the cross-platform source of truth. */
  saveReplies: (next: QuickReply[]) => Promise<void>;
}

/** Whether the connected daemon knows quick replies at all. Hosts gate the entry on this. */
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
