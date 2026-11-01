import { ChevronDown, Clock } from "lucide-react-native";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHint,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MenuTriggerState } from "@/components/ui/menu";
import { useHosts } from "@/runtime/host-runtime";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { navigationHistoryStore, type RecentAgentVisit } from "@/stores/navigation-history-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { density } from "@/styles/density";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

const ThemedClock = withUnistyles(Clock);
const ThemedChevronDown = withUnistyles(ChevronDown);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface SidebarRecentVisitsMenuProps {
  onBeforeNavigate?: () => void;
}

/**
 * 最近访问：刚看过的会话，按访问时间倒序。它与侧栏的返回/前进历史刻意分开——
 * 历史是一条可以前后走的路径，走回头路或另开一条新路时，不该丢掉刚才所在的会话。
 *
 * 会话标题、项目名等元数据按需从 session store 取；主机没连上时元数据缺失，
 * 就退回显示已有 id，而不是把这条记录删掉。
 */
export function SidebarRecentVisitsMenu({ onBeforeNavigate }: SidebarRecentVisitsMenuProps) {
  const { t } = useTranslation();
  const visits = useSyncExternalStore(
    navigationHistoryStore.subscribe,
    navigationHistoryStore.getRecentAgentVisits,
    navigationHistoryStore.getRecentAgentVisits,
  );
  const hosts = useHosts();
  const currentSelection = useActiveWorkspaceSelection();
  const currentServerId = currentSelection?.serverId ?? null;
  const currentAgentId = useCurrentAgentId(currentSelection);
  const hostLabelByServerId = useMemo(
    () => new Map(hosts.map((host) => [host.serverId, host.label])),
    [hosts],
  );

  // 触发器依据自己的悬停/打开状态上色。用 memo 是因为菜单引擎每次渲染都会调用它，
  // 不是因为这个状态要活过本次渲染。
  const triggerStyle = useCallback(
    ({ hovered, open }: MenuTriggerState) => [
      styles.trigger,
      (hovered || open) && styles.triggerHighlighted,
    ],
    [],
  );
  const renderTriggerContent = useCallback(
    ({ hovered, open }: MenuTriggerState) => {
      const highlighted = hovered || open;
      return (
        <View style={styles.triggerContent}>
          <ThemedClock
            size={ICON_SIZE.sm}
            uniProps={highlighted ? foregroundColorMapping : foregroundMutedColorMapping}
          />
          <Text
            numberOfLines={1}
            style={[styles.label, highlighted && styles.labelHighlighted, styles.triggerLabel]}
          >
            {t("sidebar.recentVisits.trigger")}
          </Text>
          <ThemedChevronDown
            size={ICON_SIZE.sm}
            uniProps={highlighted ? foregroundColorMapping : foregroundMutedColorMapping}
          />
        </View>
      );
    },
    [t],
  );

  return (
    <DropdownMenu compactMode="sheet">
      <DropdownMenuTrigger
        testID="sidebar-recent-visits"
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.recentVisits.trigger")}
        style={triggerStyle}
      >
        {renderTriggerContent}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        offset={8}
        width={360}
        maxHeight={360}
        scrollable
        sheetTitle={t("sidebar.recentVisits.trigger")}
        testID="sidebar-recent-visits-menu"
      >
        {visits.length === 0 ? (
          <DropdownMenuHint testID="sidebar-recent-visits-empty">
            {t("sidebar.recentVisits.empty")}
          </DropdownMenuHint>
        ) : (
          visits.map((visit) => (
            <RecentVisitMenuItem
              key={recentVisitKey(visit)}
              visit={visit}
              isCurrent={
                visit.serverId === currentSelection?.serverId &&
                visit.workspaceId === currentSelection?.workspaceId &&
                visit.agentId === currentAgentId
              }
              hostLabel={
                visit.serverId === currentServerId
                  ? null
                  : (hostLabelByServerId.get(visit.serverId) ?? visit.serverId)
              }
              onBeforeNavigate={onBeforeNavigate}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 此刻屏幕上那个 chat 对应的 agent，从路由所指工作区的布局里读。文件或空白 tab
 * 没有 agent，此时什么都不标“当前”——最近访问过的 agent 不是当前 agent。
 */
function useCurrentAgentId(
  selection: { serverId: string; workspaceId: string } | null,
): string | null {
  const workspaceKey = selection
    ? buildWorkspaceTabPersistenceKey({
        serverId: selection.serverId,
        workspaceId: selection.workspaceId,
      })
    : null;
  return useWorkspaceLayoutStore((state) => {
    if (!workspaceKey) {
      return null;
    }
    const layout = state.layoutByWorkspace[workspaceKey] ?? null;
    // 与导航历史 selector 同一个坑：没有存下的布局时，`getWorkspaceTabs` 会现造
    // 一个默认布局，其空白 tab 每次调用都带新的随机 id。今天这里的结果碰巧还是
    // `null`，但 selector 不能依赖这个巧合。
    if (!layout) {
      return null;
    }
    const derived = deriveWorkspacePaneState({
      layout,
      tabs: state.getWorkspaceTabs(workspaceKey),
      paneId: layout.focusedPaneId,
    });
    const target = derived.activeTab?.descriptor.target;
    return target?.kind === "agent" ? target.agentId : null;
  });
}

function recentVisitKey(visit: RecentAgentVisit): string {
  return `${visit.serverId}:${visit.workspaceId}:${visit.agentId}`;
}

function RecentVisitMenuItem({
  visit,
  isCurrent,
  hostLabel,
  onBeforeNavigate,
}: {
  visit: RecentAgentVisit;
  isCurrent: boolean;
  /** 只在这条访问属于另一个主机（不是当前视图的主机）时设置。 */
  hostLabel: string | null;
  onBeforeNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const workspace = useWorkspace(visit.serverId, visit.workspaceId);
  const agent = useSessionStore((state) => {
    const session = state.sessions[visit.serverId];
    return session?.agents.get(visit.agentId) ?? session?.agentDetails.get(visit.agentId) ?? null;
  });
  const workspaceLabel = workspace ? workspace.title?.trim() || workspace.name : visit.workspaceId;
  // 模型名让同一工作区的两个会话一眼可区分。
  const description = [hostLabel, workspaceLabel, agent?.model?.trim() ?? ""]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" · ");
  // 已归档会话进不去。元数据缺失不等于已归档：主机离线时仍要给出可用的行。
  const disabled = agent?.archivedAt != null;
  // 只有 Paseo 管理的子 agent 带 parent。provider 内部的子 agent 进不了这张表
  // （它们的目标不是 agent chat），所以没有 parent 的行就是顶层 agent。
  const isSubagent = agent?.parentAgentId != null;
  const statusBadges = useMemo(
    () => (
      <View style={styles.badges}>
        {isSubagent ? (
          <Text
            style={styles.subagentBadge}
            testID={`sidebar-recent-visit-subagent-${visit.agentId}`}
          >
            {t("sidebar.recentVisits.subagent")}
          </Text>
        ) : null}
        {isCurrent ? <Text style={styles.current}>{t("sidebar.recentVisits.current")}</Text> : null}
        <RecentVisitUpdatedAt
          date={agent?.updatedAt ?? null}
          testID={`sidebar-recent-visit-updated-${visit.agentId}`}
        />
      </View>
    ),
    [agent?.updatedAt, isCurrent, isSubagent, t, visit.agentId],
  );

  const handleSelect = useCallback(() => {
    onBeforeNavigate?.();
    navigateToWorkspace({
      serverId: visit.serverId,
      workspaceId: visit.workspaceId,
      target: { kind: "agent", agentId: visit.agentId },
    });
  }, [onBeforeNavigate, visit.agentId, visit.serverId, visit.workspaceId]);

  return (
    <DropdownMenuItem
      testID={`sidebar-recent-visit-${visit.agentId}`}
      description={description}
      disabled={disabled}
      trailing={statusBadges}
      onSelect={handleSelect}
    >
      {agent?.title?.trim() || visit.agentId}
    </DropdownMenuItem>
  );
}

/**
 * “更新于”标签自己订阅时间刷新，时间变旧只重渲染这段 Text，不重渲染整行菜单。
 */
function RecentVisitUpdatedAt({ date, testID }: { date: Date | null; testID: string }) {
  const label = useCompactTimeAgo(date);
  if (label.length === 0) {
    return null;
  }
  return (
    <Text style={styles.updatedAt} testID={testID}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    // 与旁边的返回、前进控件同一套行几何。
    minHeight: density.tightRowHeight,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  triggerHighlighted: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  triggerContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  triggerLabel: {
    flexShrink: 1,
  },
  label: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    color: theme.colors.foreground,
  },
  current: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  subagentBadge: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  updatedAt: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundExtraMuted,
  },
}));
