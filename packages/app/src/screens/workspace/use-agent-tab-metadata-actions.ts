import { useCallback } from "react";
import * as Clipboard from "expo-clipboard";
import { useTranslation } from "react-i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { planTimelineTailFetch } from "@/timeline/timeline-sync-plan";
import { buildConversationMarkdown } from "@/timeline/conversation-markdown";
import { buildProviderCommand } from "@/utils/provider-command-templates";


/**
 * tab 的复制与重载动作，tab 栏和侧栏共用这一份。
 *
 * `client` 与 `isConnected` 由调用方传入：路由的 workspace 用 host runtime 的连接，侧栏行
 * 用 session store 的连接，来源不同，但动作只认这两个值。
 */
export function useAgentTabMetadataActions({
  serverId,
  client,
  isConnected,
}: {
  serverId: string;
  client: DaemonClient | null;
  isConnected: boolean;
}): {
  onCopyAgentId: (agentId: string) => Promise<void>;
  onCopyResumeCommand: (agentId: string) => Promise<void>;
  onCopyConversationMarkdown: (agentId: string) => Promise<void>;
  onReloadAgent: (agentId: string) => Promise<void>;
} {
  const { t } = useTranslation();
  const toast = useToast();

  const onCopyAgentId = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied(t("workspace.tabs.toasts.agentIdCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );

  const onCopyResumeCommand = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const agent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
      const providerSessionId =
        agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId ?? null;
      if (!agent || !providerSessionId) {
        toast.error(t("workspace.tabs.toasts.resumeIdUnavailable"));
        return;
      }

      const command =
        buildProviderCommand({
          provider: agent.provider,
          id: "resume",
          sessionId: providerSessionId,
        }) ?? null;
      if (!command) {
        toast.error(t("workspace.tabs.toasts.resumeCommandUnavailable"));
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied(t("workspace.tabs.toasts.resumeCommandCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [serverId, toast, t],
  );

  const onCopyConversationMarkdown = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      if (!client || !isConnected) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      toast.show(t("workspace.tabs.toasts.copyingConversation"), { durationMs: null });
      try {
        const payload = await client.exportAgentConversation(agentId);
        const items = payload.entries.map((entry) => entry.item);
        const tasks = payload.tasks;
        const agentTitle =
          useSessionStore.getState().sessions[serverId]?.agents.get(agentId)?.title ?? null;
        const markdown = buildConversationMarkdown(items, tasks, { agentTitle });
        if (!markdown) {
          toast.error(t("workspace.tabs.toasts.conversationMarkdownEmpty"));
          return;
        }
        await Clipboard.setStringAsync(markdown);
        toast.copied(t("workspace.tabs.toasts.conversationMarkdownCopiedLabel"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [client, isConnected, serverId, toast, t],
  );

  const onReloadAgent = useCallback(
    async (agentId: string) => {
      if (!client || !isConnected) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }

      toast.show(t("workspace.tabs.toasts.reloadingAgent"), { durationMs: null });
      try {
        await client.refreshAgent(agentId);
        // Send the existing cursor so the server detects the new epoch and
        // returns reset:true. Without a cursor, the server returns reset:false
        // and the client takes the incremental path, where new-epoch rows are
        // dropped against the stale cursor.
        const sessionState = useSessionStore.getState().sessions[serverId];
        const currentCursor = sessionState?.agentTimelineCursor.get(agentId);
        await getHostRuntimeStore().fetchAgentTimeline(serverId, agentId, {
          ...planTimelineTailFetch(),
          ...(currentCursor
            ? { cursor: { epoch: currentCursor.epoch, seq: currentCursor.endSeq } }
            : {}),
        });
        toast.show(t("workspace.tabs.toasts.reloadedAgent"), { variant: "success" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.tabs.toasts.failedToReloadAgent"),
        );
      }
    },
    [client, isConnected, serverId, toast, t],
  );

  return { onCopyAgentId, onCopyResumeCommand, onCopyConversationMarkdown, onReloadAgent };
}
