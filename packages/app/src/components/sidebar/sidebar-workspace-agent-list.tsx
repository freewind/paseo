import { memo, useCallback, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usePanelStore } from "@/stores/panel-store";
import { useShallow } from "zustand/shallow";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import type { Agent, SessionState } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { workspaceAgentStatus } from "@/utils/workspace-agent-activity";
import { useWorkspaceAgentTabActions } from "@/screens/workspace/use-workspace-agent-tab-actions";
import { buildWorkspaceTabMenuEntries } from "@/screens/workspace/workspace-tab-menu";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import { SidebarWorkspaceAgentRowItem } from "@/components/sidebar/sidebar-workspace-agent-row-item";
import {
  agentTabLabel,
  buildSidebarWorkspaceAgentRows,
  findFocusedWorkspaceTabId,
  type SidebarWorkspaceAgentRow,
} from "@/components/sidebar/sidebar-workspace-agent-rows";

const noopAsync = () => Promise.resolve();

const EMPTY_AGENT_STATUS_BUCKETS: ReadonlyMap<string, SidebarStateBucket> = new Map();

/**
 * workspace 持有的 agent tab，列在它的 sidebar 行下面。
 *
 * 一行是一个 tab，不是一个 agent：用户关闭、重命名、重载的是看得见的 tab，所有动作都作用于
 * layout 给它的 tab id，因此从磁盘恢复的 workspace 在路由挂载之前就能正确列出。
 */
export const SidebarWorkspaceAgentList = memo(function SidebarWorkspaceAgentList({
  workspace,
}: { workspace: SidebarWorkspaceEntry }) {
  const { serverId, workspaceId, workspaceKey } = workspace;
  const isCompactLayout = useIsCompactFormFactor();
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const rows = useSidebarWorkspaceAgentRows(workspaceKey);
  const focusedTabId = useFocusedWorkspaceTabId(workspaceKey);
  const isWorkspaceActive = useIsActiveWorkspace(serverId, workspaceId);
  const titles = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
  const statusBuckets = useSidebarWorkspaceAgentStatusBuckets(serverId);
  const actions = useWorkspaceAgentTabActions({ serverId, workspaceId, rows });

  const menuEntriesByIndex = useMemo(
    () =>
      rows.map((row, index) =>
        buildWorkspaceTabMenuEntries({
          surface: isCompactLayout ? "mobile" : "desktop",
          tab: { key: row.tabId, tabId: row.tabId, kind: "agent", target: row.target },
          index,
          tabCount: rows.length,
          menuTestIDBase: `sidebar-workspace-agent-menu-${row.tabId}`,
          onCopyResumeCommand: actions.onCopyResumeCommand,
          onCopyAgentId: actions.onCopyAgentId,
          onCopyAgentAsNew: actions.onCopyAgentAsNew,
          canCloneAgent: actions.canCloneAgent,
          // 不可达：列表只放 agent tab，菜单对它们不提供这几项。
          onCopyTerminalId: noopAsync,
          onCopyFilePath: noopAsync,
          onReloadAgent: actions.onReloadAgent,
          onRenameTab: actions.onRenameTab,
          onCloseTab: actions.onCloseTab,
          onCloseTabsBefore: actions.onCloseTabsBefore,
          onCloseTabsAfter: actions.onCloseTabsAfter,
          onCloseOtherTabs: actions.onCloseOtherTabs,
        }),
      ),
    [actions, isCompactLayout, rows],
  );

  const openAgent = useCallback(
    (agentId: string) => {
      if (isCompactLayout) {
        showMobileAgent();
      }
      navigateToAgent({ serverId, agentId, workspaceId });
    },
    [isCompactLayout, serverId, showMobileAgent, workspaceId],
  );

  if (rows.length === 0) return null;

  return (
    <View style={styles.list} testID={`sidebar-workspace-agents-${workspaceKey}`}>
      {rows.map((row, index) => {
        return (
          <SidebarWorkspaceAgentRowItem
            key={row.tabId}
            row={row}
            isActive={isWorkspaceActive && focusedTabId === row.tabId}
            label={agentTabLabel(titles?.get(row.agentId)?.title, row.agentId)}
            statusBucket={statusBuckets.get(row.agentId) ?? null}
            menuEntries={menuEntriesByIndex[index]}
            onOpenAgent={openAgent}
          />
        );
      })}
      {actions.renameModal}
    </View>
  );
});

/**
 * 每个 agent 自己的状态，按 agent id 索引。
 *
 * 读的是 tab 栏图标读的那几个字段，行和它代表的 tab 才不会对「该 agent 在干活还是在等用户」
 * 给出不同答案。selector 用 shallow，是因为只要有 agent 变化这个 map 就会重建；每次调用都
 * 返回新对象会让整个列表在 store 每次 tick 时重渲染。
 */
function useSidebarWorkspaceAgentStatusBuckets(
  serverId: string,
): ReadonlyMap<string, SidebarStateBucket> {
  return useSessionStore(
    useShallow((state) => {
      const session = state.sessions[serverId];
      if (!session) return EMPTY_AGENT_STATUS_BUCKETS;
      const next = new Map<string, SidebarStateBucket>();
      for (const agent of session.agents.values()) {
        next.set(agent.id, deriveAgentStatusBucket(session, agent));
      }
      return next;
    }),
  );
}

function deriveAgentStatusBucket(session: SessionState, agent: Agent): SidebarStateBucket {
  // turn 活跃包含「消息已提交、provider 还没确认」这一段，此时 tab 栏已在转圈，
  // 侧栏行不能显示空闲；turn 不活跃时再降级残留的 running，两行才不会一个转一个不转。
  const isTurnActive = selectAgentTurnPresentation(session, agent.id).isActive;
  return deriveSidebarStateBucket({
    status: isTurnActive ? "running" : workspaceAgentStatus(agent),
    pendingPermissionCount: agent.pendingPermissions.length,
    requiresAttention: agent.requiresAttention ?? false,
    attentionReason: agent.attentionReason ?? null,
  });
}

function useSidebarWorkspaceAgentRows(workspaceKey: string): SidebarWorkspaceAgentRow[] {
  const layout = useWorkspaceLayoutStore((state) => state.layoutByWorkspace[workspaceKey] ?? null);
  return useMemo(() => buildSidebarWorkspaceAgentRows(layout), [layout]);
}

function useFocusedWorkspaceTabId(workspaceKey: string): string | null {
  const layout = useWorkspaceLayoutStore((state) => state.layoutByWorkspace[workspaceKey] ?? null);
  return useMemo(() => findFocusedWorkspaceTabId(layout), [layout]);
}

function useIsActiveWorkspace(serverId: string, workspaceId: string): boolean {
  const selection = useActiveWorkspaceSelection();
  return selection?.serverId === serverId && selection.workspaceId === workspaceId;
}

const styles = StyleSheet.create((theme) => ({
  // 只往左收进：行自身的 padding 在背景盒内部，没有这一条时 agent 行的选中面会和上方
  // workspace 行同 x 起步，两块会被读成一体。右边缘与 workspace 行对齐，⋯ 菜单列才能在
  // sidebar 上保持一条竖轨。
  list: {
    marginLeft: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
}));
