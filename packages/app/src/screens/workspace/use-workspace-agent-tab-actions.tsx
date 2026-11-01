import { useCallback, useMemo, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useHostFeature } from "@/runtime/host-features";
import type { TFunction } from "i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ToastApi } from "@/components/toast-host";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { resolveCloseAgentTabPolicy } from "@/subagents/close-tab-policy";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useDeleteAgent } from "@/hooks/use-delete-agent";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import {
  agentTabLabel,
  type SidebarWorkspaceAgentRow,
} from "@/components/sidebar/sidebar-workspace-agent-rows";
import { useAgentTabMetadataActions } from "@/screens/workspace/use-agent-tab-metadata-actions";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useBulkCloseConfirmationLabels } from "@/screens/workspace/use-bulk-close-confirmation-labels";
import { closeBulkWorkspaceTabs } from "@/screens/workspace/workspace-bulk-close";
import { useCloseTabs } from "@/screens/workspace/use-close-tabs";
import { removeAgentTabWithLayoutCleanup } from "@/screens/workspace/agent-tab-cleanup";
import { buildBulkClosePlan } from "@/screens/workspace/bulk-close-plan";
import {
  closeLayoutOnlyAgent,
  detachAgentFromOpenTabs,
} from "@/screens/workspace/close-layout-only-agent";
import { confirmArchiveRunningAgent } from "@/screens/workspace/confirm-archive-running-agent";
import {
  useWorkspaceTabRename,
  WorkspaceTabRenameModal,
} from "@/screens/workspace/use-workspace-tab-rename";

/** 重命名只碰这个列表里的 agent，hook 的 terminal 分支不可达。 */
const NO_TERMINALS_QUERY_KEY: readonly unknown[] = ["workspace-agent-tab-rename"];

/** 列表里没有带未保存内容的面板，批量关闭的「未保存」集合恒为空。 */
const NO_MODIFIED_TAB_IDS: ReadonlySet<string> = new Set();

/** 本地 24 小时制 `HH:mm`：后缀要固定形状，不走 locale 格式。 */
function formatClockTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * 副本沿用源会话标题并加上生成时间，标签栏里才分得清原件与副本。只是展示用，
 * 改名失败就保持原名，不阻塞导航。
 */
async function nameClonedAgent(input: {
  client: DaemonClient;
  serverId: string;
  sourceAgentId: string;
  newAgentId: string;
}): Promise<void> {
  const session = useSessionStore.getState().sessions[input.serverId];
  const source =
    session?.agents?.get(input.sourceAgentId) ??
    session?.agentDetails?.get(input.sourceAgentId) ??
    null;
  const base = agentTabLabel(source?.title, "");
  if (!base) return;
  await input.client
    .updateAgent(input.newAgentId, { name: `${base} · ${formatClockTime()}` })
    .catch(() => undefined);
}

/**
 * 复制整段会话成新标签：标签菜单在桌面标签行、侧栏和移动切换器里都出现，行为只能有一份。
 * 复制不需要回合边界，也不改源 agent。
 */
export async function copyAgentAsNewTab(input: {
  agentId: string;
  client: DaemonClient | null;
  isConnected: boolean;
  supportsClone: boolean;
  serverId: string;
  workspaceId: string;
  toast: ToastApi;
  t: TFunction;
}): Promise<void> {
  if (!input.agentId) return;
  if (!input.client || !input.isConnected) {
    input.toast.error(input.t("workspace.terminal.hostDisconnected"));
    return;
  }
  if (!input.supportsClone) {
    input.toast.error(input.t("workspace.tabs.toasts.cloneUnavailable"));
    return;
  }
  try {
    const copy = await input.client.cloneAgent(input.agentId);
    void nameClonedAgent({
      client: input.client,
      serverId: input.serverId,
      sourceAgentId: input.agentId,
      newAgentId: copy.newAgentId,
    });
    navigateToWorkspace({
      serverId: input.serverId,
      workspaceId: copy.newWorkspaceId ?? input.workspaceId,
      target: { kind: "agent", agentId: copy.newAgentId },
    });
  } catch (error) {
    input.toast.error(
      error instanceof Error ? error.message : input.t("workspace.tabs.toasts.cloneFailed"),
    );
  }
}

type BulkCloseTitleKey = "closeTabsLeftTitle" | "closeTabsRightTitle" | "closeOtherTabsTitle";

interface WorkspaceAgentTabActions {
  onCopyResumeCommand: (agentId: string) => Promise<void>;
  onCopyAgentId: (agentId: string) => Promise<void>;
  onCopyAgentAsNew: (agentId: string) => Promise<void>;
  canCloneAgent: boolean;
  onDeleteAgent: (agentId: string) => Promise<void>;
  onReloadAgent: (agentId: string) => Promise<void>;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void>;
  onCloseTabsBefore: (tabId: string) => Promise<void>;
  onCloseTabsAfter: (tabId: string) => Promise<void>;
  onCloseOtherTabs: (tabId: string) => Promise<void>;
  /** 由持有这个 hook 的列表渲染一次，弹窗才不会每行重复。 */
  renameModal: ReactElement | null;
}

/**
 * tab 菜单的动作，适用于任意 workspace 的 agent tab —— 包括用户没在看的那个。workspace
 * 屏幕自己的 handler 绑在路由的 workspace 上，其他 workspace 的 sidebar 行用不了；这个 hook
 * 改为直接接收身份参数。
 *
 * 行为就是 tab 行的行为：同样的确认、同样的关闭即归档策略、同样的复制与重载，批量关闭由
 * `classifyBulkClosableTabs` / `closeBulkWorkspaceTabs` 驱动。
 */
export function useWorkspaceAgentTabActions({
  serverId,
  workspaceId,
  rows,
}: {
  serverId: string;
  workspaceId: string;
  /**
   * workspace 的 agent tab，按列表顺序。「关闭左侧 / 右侧 / 其他」作用在这个列表上，而不是
   * 某个 pane 的 tab 栏：用户看的只有 sidebar 列表，所以它显示的范围就是菜单关闭的范围。
   * 因此分屏 workspace 这里没有「tab 栏的左侧」—— 列表顺序就是整个 workspace。
   */
  rows: readonly SidebarWorkspaceAgentRow[];
}): WorkspaceAgentTabActions {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { archiveAgent } = useArchiveAgent();
  const { deleteAgent } = useDeleteAgent();
  const { closeTab } = useCloseTabs();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const hideWorkspaceAgent = useWorkspaceLayoutStore((state) => state.hideAgent);

  const workspaceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );

  const workspaceLayoutActions = useMemo(
    () => ({
      unpinAgent: unpinWorkspaceAgent,
      hideAgent: hideWorkspaceAgent,
      closeTab: closeWorkspaceTab,
    }),
    [closeWorkspaceTab, hideWorkspaceAgent, unpinWorkspaceAgent],
  );

  const { renamingTab, handleRenameTab, handleRenameModalSubmit, handleRenameModalClose } =
    useWorkspaceTabRename({
      client,
      normalizedServerId: serverId,
      queryClient,
      terminalsData: undefined,
      terminalsQueryKey: NO_TERMINALS_QUERY_KEY,
    });

  const bulkCloseConfirmationLabels = useBulkCloseConfirmationLabels();

  const { onCopyAgentId, onCopyResumeCommand, onReloadAgent } = useAgentTabMetadataActions({
    serverId,
    client,
    isConnected,
  });

  const supportsCloneAgent = useHostFeature(serverId, "agentCloneSession");
  const onDeleteAgent = useCallback(
    async (agentId: string) => {
      await deleteAgent({ serverId, agentId });
    },
    [deleteAgent, serverId],
  );
  const onCopyAgentAsNew = useCallback(
    async (agentId: string) => {
      await copyAgentAsNewTab({
        agentId,
        client,
        isConnected,
        supportsClone: supportsCloneAgent,
        serverId,
        workspaceId,
        toast,
        t,
      });
    },
    [client, isConnected, serverId, supportsCloneAgent, t, toast, workspaceId],
  );

  const closeWorkspaceTabWithCleanup = useCallback(
    (tabId: string, agentId: string) => {
      removeAgentTabWithLayoutCleanup({
        layout: workspaceLayoutActions,
        workspaceKey,
        tabId,
        agentId,
      });
    },
    [workspaceKey, workspaceLayoutActions],
  );

  const closeAgentTab = useCallback(
    async (input: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = input;
      await closeTab(tabId, async () => {
        const agent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
        let closePolicy = resolveCloseAgentTabPolicy(agent);

        if (!(await confirmArchiveRunningAgent({ t, agent }))) {
          return;
        }

        if (closePolicy.kind === "layout-only") {
          try {
            await detachAgentFromOpenTabs({ client, agentId });
          } catch (error) {
            console.error("[WorkspaceAgentTabActions] Failed to close subagent tab", {
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
        // Errors (e.g. timeout) are handled by the mutation's onSettled callback
        void archiveAgent({ serverId, agentId }).catch(() => {});
      });
    },
    [archiveAgent, client, closeTab, closeWorkspaceTabWithCleanup, serverId, t, toast],
  );

  // 列表只有 agent tab，没有带未保存内容的文件面板，所以不做"未保存内容"的确认。
  const onCloseTab = useCallback(
    async (tabId: string) => {
      const row = rows.find((candidate) => candidate.tabId === tabId);
      if (!row) return;
      await closeAgentTab({ tabId, agentId: row.agentId });
    },
    [closeAgentTab, rows],
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

      const plan = buildBulkClosePlan({
        tabsToClose,
        resolveKind: (agentId) =>
          resolveCloseAgentTabPolicy(
            useSessionStore.getState().sessions[serverId]?.agents?.get(agentId),
          ).kind === "layout-only"
            ? "layout-only"
            : "archive",
        modifiedTabIds: NO_MODIFIED_TAB_IDS,
        labels: bulkCloseConfirmationLabels,
        unsavedMessage: (count) => t("workspace.tabs.confirmations.bulkUnsaved", { count }),
      });
      const confirmed = await confirmDialog({
        title: t(`workspace.tabs.confirmations.${input.titleKey}`),
        message: plan.message,
        confirmLabel: t("workspace.tabs.confirmations.close"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) return;

      await closeBulkWorkspaceTabs({
        client,
        groups: plan.groups,
        closeTab,
        closeLayoutOnlyAgent: (agentId) =>
          closeLayoutOnlyAgent({ serverId, client, archiveAgent, agentId }),
        closeWorkspaceTabWithCleanup: ({ tabId: closedTabId, target }) => {
          if (target?.kind === "agent") {
            closeWorkspaceTabWithCleanup(closedTabId, target.agentId);
          }
        },
        logLabel: "from the sidebar agent list",
        warn: console.warn,
      });
    },
    [
      archiveAgent,
      bulkCloseConfirmationLabels,
      client,
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

  return useMemo(
    () => ({
      onCopyResumeCommand,
      onCopyAgentId,
      onCopyAgentAsNew,
      canCloneAgent: supportsCloneAgent,
      onDeleteAgent,
      onReloadAgent,
      onRenameTab: handleRenameTab,
      onCloseTab,
      onCloseTabsBefore,
      onCloseTabsAfter,
      onCloseOtherTabs,
      renameModal,
    }),
    [
      handleRenameTab,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsAfter,
      onCloseTabsBefore,
      onCopyAgentId,
      onCopyAgentAsNew,
      supportsCloneAgent,
      onDeleteAgent,
      onCopyResumeCommand,
      onReloadAgent,
      renameModal,
    ],
  );
}
