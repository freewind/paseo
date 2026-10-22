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
import { navigationHistoryStore, type RecentAgentVisit } from "@/stores/navigation-history-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
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

  // The trigger styles itself from its own hover/open state. Memoized because the
  // menu engine calls it per render, not because the state outlives the render.
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
        width={280}
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
 * The agent whose chat is on screen right now, read from the layout of the
 * workspace the route points at. A file or blank tab has none, and then nothing
 * is marked as current — the last visited agent is not the current one.
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
    // Same trap as the navigation-history selector: without a stored layout,
    // `getWorkspaceTabs` synthesizes one whose blank tab has a fresh random id on
    // every call. The answer below happens to stay `null` today, but the selector
    // must not depend on that accident.
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
  /** Set only when the visit belongs to a host other than the one in view. */
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
  // The model is what tells two sessions of the same workspace apart at a glance.
  const description = [hostLabel, workspaceLabel, agent?.model?.trim() ?? ""]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" · ");
  // An archived session cannot be entered. Missing metadata is not archived
  // metadata: an offline host must still resolve to a usable row.
  const disabled = agent?.archivedAt != null;
  // Only a Paseo-managed subagent carries a parent. Provider-internal subagents never reach this
  // list (their target is not an agent chat), so a row without one is a top-level agent.
  const isSubagent = agent?.parentAgentId != null;
  const statusBadges = useMemo(() => {
    if (!isCurrent && !isSubagent) {
      return undefined;
    }
    return (
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
      </View>
    );
  }, [isCurrent, isSubagent, t, visit.agentId]);

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

const styles = StyleSheet.create((theme) => ({
  trigger: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    // Same row geometry as the back and forward controls beside it.
    minHeight: 28,
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
}));
