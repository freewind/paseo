import { useCallback, useMemo, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { getOpenAgentTabLabel } from "@getpaseo/protocol/agent-labels";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { resolveCloseAgentTabPolicy } from "@/subagents/close-tab-policy";
import { buildConversationMarkdown } from "@/timeline/conversation-markdown";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { getPanelInstanceAttributes } from "@/panels/panel-instance-attributes";
import { confirmDialog } from "@/utils/confirm-dialog";
import { getOrCreateClientId } from "@/utils/client-id";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import type { SidebarWorkspaceAgentRow } from "@/components/sidebar/sidebar-workspace-agent-rows";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
  closeBulkWorkspaceTabs,
  type BulkCloseConfirmationLabels,
} from "@/screens/workspace/workspace-bulk-close";
import { useCloseTabs } from "@/screens/workspace/use-close-tabs";
import {
  useWorkspaceTabRename,
  WorkspaceTabRenameModal,
} from "@/screens/workspace/use-workspace-tab-rename";

/** Rename only ever touches agents from this list, so the terminal branch of the hook is unreachable. */
const NO_TERMINALS_QUERY_KEY: readonly unknown[] = ["workspace-agent-tab-rename"];

type BulkCloseTitleKey = "closeTabsLeftTitle" | "closeTabsRightTitle" | "closeOtherTabsTitle";

export interface HideWorkspaceAgentTabActions {
  onHideTab: (tabId: string) => Promise<void>;
}

function readAgentIdForTab(workspaceKey: string, tabId: string): string | null {
  const tab = useWorkspaceLayoutStore
    .getState()
    .getWorkspaceTabs(workspaceKey)
    .find((candidate) => candidate.tabId === tabId);
  return tab?.target.kind === "agent" ? tab.target.agentId : null;
}

/**
 * Hide an agent tab without ending the agent.
 *
 * The agent keeps running, stays unarchived, and a subagent stays listed in its parent's track so
 * the user can reopen it from there. Only this client stops showing the tab, which is why the tab is
 * hidden rather than merely closed: reconciliation would otherwise add a root agent back.
 *
 * A subagent's open-tab label is this client's claim that it is still open, so it is released
 * before the tab disappears. When that write fails the tab stays: leaving it visible keeps the label
 * truthful, and a later parent archive must not treat a hidden-but-open child as closed. Nothing
 * here archives, stops, or reloads the agent, whatever its parent relationship is at the time.
 */
export function useHideWorkspaceAgentTab({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}): HideWorkspaceAgentTabActions {
  const { t } = useTranslation();
  const toast = useToast();
  const { closeTab } = useCloseTabs();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const hideWorkspaceAgent = useWorkspaceLayoutStore((state) => state.hideAgent);

  const workspaceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );

  const onHideTab = useCallback(
    async (tabId: string) => {
      if (!workspaceKey) return;
      const agentId = readAgentIdForTab(workspaceKey, tabId);
      if (!agentId) return;
      await closeTab(tabId, async () => {
        const session = useSessionStore.getState().sessions[serverId];
        const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId) ?? null;
        if (agent?.parentAgentId) {
          if (!client) {
            toast.error(t("common.errors.daemonClientUnavailable"));
            return;
          }
          try {
            const clientId = await getOrCreateClientId();
            await client.updateAgent(agentId, {
              labels: { [getOpenAgentTabLabel(clientId)]: "false" },
            });
          } catch (error) {
            console.error("[HideAgentTab] Failed to release hidden subagent tab", {
              error,
              agentId,
            });
            toast.error(t("workspace.tabs.toasts.failedToHideAgent"));
            return;
          }
        }
        unpinWorkspaceAgent(workspaceKey, agentId);
        hideWorkspaceAgent(workspaceKey, agentId);
        closeWorkspaceTab(workspaceKey, tabId);
      });
    },
    [
      client,
      closeTab,
      closeWorkspaceTab,
      hideWorkspaceAgent,
      serverId,
      t,
      toast,
      unpinWorkspaceAgent,
      workspaceKey,
    ],
  );

  return { onHideTab };
}

/**
 * Copies a whole agent conversation as Markdown: one unbounded timeline fetch (`limit: 0` asks
 * for every row in the tail window) keeps the transcript independent of what the user has
 * scrolled to, and only user and assistant text survives the projection.
 */
export function useCopyAgentConversationMarkdown({
  serverId,
}: {
  serverId: string;
}): (agentId: string) => Promise<void> {
  const { t } = useTranslation();
  const toast = useToast();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);

  return useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      if (!client || !isConnected) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      toast.show(t("workspace.tabs.toasts.copyingConversation"), { durationMs: null });
      try {
        const page = await client.fetchAgentTimeline(agentId, {
          direction: "tail",
          limit: 0,
          projection: "projected",
        });
        if (page.error) {
          toast.error(page.error);
          return;
        }
        const markdown = buildConversationMarkdown(page.entries.map((entry) => entry.item));
        if (!markdown) {
          toast.error(t("workspace.tabs.toasts.conversationMarkdownEmpty"));
          return;
        }
        await Clipboard.setStringAsync(markdown);
        toast.copied(t("workspace.tabs.toasts.conversationMarkdownCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [client, isConnected, t, toast],
  );
}

export interface UseWorkspaceAgentTabActionsInput {
  serverId: string;
  workspaceId: string;
  /**
   * The workspace's agent tabs in list order. `close left` / `close right` / `close others` act on
   * this list rather than on a pane's tab strip: the sidebar list is the only surface the user is
   * looking at, so the scope it shows is the scope the menu closes. A workspace split across panes
   * therefore has no tab-strip "left" here — the list order is the whole workspace.
   */
  rows: readonly SidebarWorkspaceAgentRow[];
}

export interface WorkspaceAgentTabActions {
  onCopyResumeCommand: (agentId: string) => Promise<void>;
  onCopyAgentId: (agentId: string) => Promise<void>;
  onCopyConversationMarkdown: (agentId: string) => Promise<void>;
  onReloadAgent: (agentId: string) => Promise<void>;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void>;
  onCloseTabsBefore: (tabId: string) => Promise<void>;
  onCloseTabsAfter: (tabId: string) => Promise<void>;
  onCloseOtherTabs: (tabId: string) => Promise<void>;
  onHideTab: (tabId: string) => Promise<void>;
  /** Rendered once by the list that owns this hook, so the modal is not repeated per row. */
  renameModal: ReactElement | null;
}

/**
 * The tab menu's actions, for an agent tab of any workspace — including one the user is not looking
 * at. The workspace screen's own handlers are bound to the route's workspace, so a sidebar row for
 * any other workspace cannot use them; this hook takes the identity instead.
 *
 * Behavior is the tab row's behavior: same confirmations, same archive-on-close policy, same copy
 * and reload, with the bulk close driven by `classifyBulkClosableTabs` / `closeBulkWorkspaceTabs`.
 */
export function useWorkspaceAgentTabActions({
  serverId,
  workspaceId,
  rows,
}: UseWorkspaceAgentTabActionsInput): WorkspaceAgentTabActions {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { archiveAgent } = useArchiveAgent();
  const { closeTab } = useCloseTabs();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const hideWorkspaceAgent = useWorkspaceLayoutStore((state) => state.hideAgent);

  const workspaceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );

  const hideAgentTab = useHideWorkspaceAgentTab({ serverId, workspaceId });

  const { renamingTab, handleRenameTab, handleRenameModalSubmit, handleRenameModalClose } =
    useWorkspaceTabRename({
      client,
      normalizedServerId: serverId,
      queryClient,
      terminalsData: undefined,
      terminalsQueryKey: NO_TERMINALS_QUERY_KEY,
    });

  const bulkCloseConfirmationLabels = useMemo<BulkCloseConfirmationLabels>(
    () => ({
      newTab: t("workspace.tabs.actions.newTab"),
      all: ({ agents, terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.all", {
          agents,
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTerminals: ({ agents, terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTerminals", {
          agents,
          terminals: terminalCount,
        }),
      terminalsAndTabs: ({ terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.terminalsAndTabs", {
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTabs: ({ agents, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTabs", { agents, tabs: tabCount }),
      terminals: ({ terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.terminals", { terminals: terminalCount }),
      tabs: ({ tabs: tabCount }) => t("workspace.tabs.confirmations.bulk.tabs", { tabs: tabCount }),
      agents: ({ agents }) => t("workspace.tabs.confirmations.bulk.agents", { agents }),
    }),
    [t],
  );

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
    [t, toast],
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
    [serverId, t, toast],
  );

  const onCopyConversationMarkdown = useCopyAgentConversationMarkdown({ serverId });

  const onReloadAgent = useCallback(
    async (agentId: string) => {
      if (!client || !isConnected) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      toast.show(t("workspace.tabs.toasts.reloadingAgent"), { durationMs: null });
      try {
        await client.refreshAgent(agentId);
        // Send the existing cursor so the server detects the new epoch and returns reset:true;
        // without one it takes the incremental path, where new-epoch rows are dropped against
        // the stale cursor.
        const sessionState = useSessionStore.getState().sessions[serverId];
        const currentCursor = sessionState?.agentTimelineCursor.get(agentId);
        await getHostRuntimeStore().fetchAgentTimeline(serverId, agentId, {
          direction: "tail",
          projection: "projected",
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
    [client, isConnected, serverId, t, toast],
  );

  const closeWorkspaceTabWithCleanup = useCallback(
    (tabId: string, agentId: string) => {
      if (!workspaceKey) return;
      unpinWorkspaceAgent(workspaceKey, agentId);
      hideWorkspaceAgent(workspaceKey, agentId);
      closeWorkspaceTab(workspaceKey, tabId);
    },
    [closeWorkspaceTab, hideWorkspaceAgent, unpinWorkspaceAgent, workspaceKey],
  );

  const closeLayoutOnlyAgent = useCallback(
    async (agentId: string) => {
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      const clientId = await getOrCreateClientId();
      await client.updateAgent(agentId, { labels: { [getOpenAgentTabLabel(clientId)]: "false" } });
      const latestAgent =
        useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
      if (resolveCloseAgentTabPolicy(latestAgent).kind === "archive-on-close") {
        await archiveAgent({ serverId, agentId });
      }
    },
    [archiveAgent, client, serverId, t],
  );

  const closeAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      await closeTab(tabId, async () => {
        const agent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
        let closePolicy = resolveCloseAgentTabPolicy(agent);

        if (agent?.status === "running" && closePolicy.kind === "archive-on-close") {
          const confirmed = await confirmDialog({
            title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
            message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
            confirmLabel: t("workspace.tabs.confirmations.archive"),
            cancelLabel: t("workspace.tabs.confirmations.cancel"),
            destructive: true,
          });
          if (!confirmed) return;
        }

        if (closePolicy.kind === "layout-only") {
          try {
            await closeLayoutOnlyAgent(agentId);
          } catch (error) {
            console.error("[SidebarWorkspaceAgentList] Failed to close subagent tab", {
              error,
              agentId,
            });
            toast.error(t("workspace.tabs.toasts.failedToCloseAgent"));
            return;
          }
          const latestAgent =
            useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
          closePolicy = resolveCloseAgentTabPolicy(latestAgent);
        }

        closeWorkspaceTabWithCleanup(tabId, agentId);

        if (closePolicy.kind === "layout-only") return;
        // Failures (e.g. a timeout) are handled by the archive mutation's own onSettled.
        void archiveAgent({ serverId, agentId }).catch(() => {});
      });
    },
    [
      archiveAgent,
      closeLayoutOnlyAgent,
      closeTab,
      closeWorkspaceTabWithCleanup,
      serverId,
      t,
      toast,
    ],
  );

  const confirmDiscardModifiedTab = useCallback(
    async (tabId: string): Promise<boolean> => {
      const attributes = getPanelInstanceAttributes({ serverId, workspaceId, tabId });
      if (!attributes.modified) return true;
      const resumePendingSave = attributes.suspendPendingSave?.();
      const confirmed = await confirmDialog({
        title: t("workspace.tabs.confirmations.unsavedTitle"),
        message: t("workspace.tabs.confirmations.unsavedMessage"),
        confirmLabel: t("workspace.tabs.confirmations.closeWithoutSaving"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) resumePendingSave?.();
      return confirmed;
    },
    [serverId, t, workspaceId],
  );

  const onCloseTab = useCallback(
    async (tabId: string) => {
      const row = rows.find((candidate) => candidate.tabId === tabId);
      if (!row) return;
      if (!(await confirmDiscardModifiedTab(tabId))) return;
      await closeAgentTab({ tabId, agentId: row.agentId });
    },
    [closeAgentTab, confirmDiscardModifiedTab, rows],
  );

  const closeTabsRelativeTo = useCallback(
    async (
      tabId: string,
      input: { titleKey: BulkCloseTitleKey; shouldCloseIndex: (index: number) => boolean },
    ) => {
      const index = rows.findIndex((row) => row.tabId === tabId);
      if (index < 0) return;
      const tabsToClose = rows
        .filter((_row, other) => input.shouldCloseIndex(other))
        .map((row) => ({
          key: row.tabId,
          tabId: row.tabId,
          kind: "agent" as const,
          target: row.target,
        }));
      if (tabsToClose.length === 0) return;

      const groups = classifyBulkClosableTabs(tabsToClose, (agentId) =>
        resolveCloseAgentTabPolicy(
          useSessionStore.getState().sessions[serverId]?.agents?.get(agentId),
        ).kind === "layout-only"
          ? "layout-only"
          : "archive",
      );
      const confirmed = await confirmDialog({
        title: t(`workspace.tabs.confirmations.${input.titleKey}`),
        message: buildBulkCloseConfirmationMessage(groups, bulkCloseConfirmationLabels),
        confirmLabel: t("workspace.tabs.confirmations.close"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) return;

      await closeBulkWorkspaceTabs({
        client,
        groups,
        closeTab,
        closeLayoutOnlyAgent,
        closeWorkspaceTabWithCleanup: ({ tabId: closedTabId, target }) => {
          if (target?.kind === "agent") {
            closeWorkspaceTabWithCleanup(closedTabId, target.agentId);
          }
        },
        logLabel: "from the sidebar agent list",
        warn: (message, payload) => {
          console.warn(message, payload);
        },
      });
    },
    [
      bulkCloseConfirmationLabels,
      client,
      closeLayoutOnlyAgent,
      closeTab,
      closeWorkspaceTabWithCleanup,
      rows,
      serverId,
      t,
    ],
  );

  const onCloseTabsBefore = useCallback(
    (tabId: string) =>
      closeTabsRelativeTo(tabId, {
        titleKey: "closeTabsLeftTitle",
        shouldCloseIndex: (other) => other < rows.findIndex((row) => row.tabId === tabId),
      }),
    [closeTabsRelativeTo, rows],
  );

  const onCloseTabsAfter = useCallback(
    (tabId: string) =>
      closeTabsRelativeTo(tabId, {
        titleKey: "closeTabsRightTitle",
        shouldCloseIndex: (other) => other > rows.findIndex((row) => row.tabId === tabId),
      }),
    [closeTabsRelativeTo, rows],
  );

  const onCloseOtherTabs = useCallback(
    (tabId: string) =>
      closeTabsRelativeTo(tabId, {
        titleKey: "closeOtherTabsTitle",
        shouldCloseIndex: (other) => other !== rows.findIndex((row) => row.tabId === tabId),
      }),
    [closeTabsRelativeTo, rows],
  );

  const renameModal = useMemo(
    () => (
      <WorkspaceTabRenameModal
        renamingTab={renamingTab}
        onClose={handleRenameModalClose}
        onSubmit={handleRenameModalSubmit}
      />
    ),
    [handleRenameModalClose, handleRenameModalSubmit, renamingTab],
  );

  return {
    onCopyResumeCommand,
    onCopyAgentId,
    onCopyConversationMarkdown,
    onReloadAgent,
    onRenameTab: handleRenameTab,
    onCloseTab,
    onCloseTabsBefore,
    onCloseTabsAfter,
    onCloseOtherTabs,
    onHideTab: hideAgentTab.onHideTab,
    renameModal,
  };
}
