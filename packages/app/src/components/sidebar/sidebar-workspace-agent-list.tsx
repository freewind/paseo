import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useAppSettings } from "@/hooks/use-settings";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usePanelStore } from "@/stores/panel-store";
import { useShallow } from "zustand/shallow";
import { useSessionStore, selectAgentTurnPresentation } from "@/stores/session-store";
import type { Agent, SessionState } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { findFocusedWorkspaceTabId } from "@/components/sidebar/sidebar-workspace-agent-rows";
import { SidebarStatusSlot } from "@/components/sidebar/sidebar-status-slot";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { useWorkspaceAgentTabActions } from "@/screens/workspace/use-workspace-agent-tab-actions";
import { MobileTabTrailingAccessory } from "@/screens/workspace/workspace-tab-trailing-accessory";
import {
  buildWorkspaceTabMenuEntries,
  type WorkspaceTabMenuEntry,
} from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { SidebarWorkspaceEntry } from "@/hooks/sidebar-workspaces-view-model";
import {
  buildSidebarWorkspaceAgentRows,
  type SidebarWorkspaceAgentRow,
} from "@/components/sidebar/sidebar-workspace-agent-rows";

const noopAsync = () => Promise.resolve();

const EMPTY_AGENT_STATUS_BUCKETS: ReadonlyMap<string, SidebarStateBucket> = new Map();

export interface SidebarWorkspaceAgentListProps {
  workspace: SidebarWorkspaceEntry;
}

interface SidebarWorkspaceAgentRowItemProps {
  row: SidebarWorkspaceAgentRow;
  isActive: boolean;
  label: string;
  /** The agent's own state, read exactly as the tab strip's icon reads it. */
  statusBucket: SidebarStateBucket | null;
  menuEntries: WorkspaceTabMenuEntry[];
  /** The "Title lines" setting: when on, a long agent title wraps instead of ending in an ellipsis. */
  multilineTitle: boolean;
  onPress: () => void;
}

function agentTabLabel(title: string | null | undefined, fallback: string): string {
  const normalized = typeof title === "string" ? title.trim() : "";
  // The daemon seeds an untitled agent as "New agent", which is a placeholder rather than a name.
  return !normalized || normalized.toLowerCase() === "new agent" ? fallback : normalized;
}

/**
 * The agent tabs a workspace holds, listed under its sidebar row.
 *
 * A row is a tab, not an agent: the user closes, renames, and reloads the tab they can see, and
 * every action runs against the tab id the layout gave it, so a workspace restored from disk lists
 * correctly before its route has mounted.
 */
export const SidebarWorkspaceAgentList = memo(function SidebarWorkspaceAgentList({
  workspace,
}: SidebarWorkspaceAgentListProps) {
  const { serverId, workspaceId, workspaceKey } = workspace;
  const isCompactLayout = useIsCompactFormFactor();
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const rows = useSidebarWorkspaceAgentRows(workspaceKey);
  const focusedTabId = useFocusedWorkspaceTabId(workspaceKey);
  const isWorkspaceActive = useActiveWorkspaceKey(serverId, workspaceId);
  const titles = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
  const statusBuckets = useSidebarWorkspaceAgentStatusBuckets(serverId);
  // The same "Title lines" setting that lets a workspace title wrap governs the agent rows nested
  // under it, so a long agent title stops ending in a lone ellipsis under the ⋯ menu.
  const {
    settings: { workspaceTitleMultiline },
  } = useAppSettings();
  const actions = useWorkspaceAgentTabActions({ serverId, workspaceId, rows });

  const descriptors = useMemo<WorkspaceTabDescriptor[]>(
    () =>
      rows.map((row) => ({
        key: row.tabId,
        tabId: row.tabId,
        kind: "agent" as const,
        target: row.target,
      })),
    [rows],
  );

  const menuEntriesFor = useCallback(
    (tab: WorkspaceTabDescriptor, index: number) =>
      buildWorkspaceTabMenuEntries({
        surface: "desktop",
        tab,
        index,
        tabCount: descriptors.length,
        menuTestIDBase: `sidebar-workspace-agent-menu-${tab.tabId}`,
        onCopyResumeCommand: actions.onCopyResumeCommand,
        onCopyAgentId: actions.onCopyAgentId,
        onCopyConversationMarkdown: actions.onCopyConversationMarkdown,
        // Unreachable: the list only holds agent tabs, which the menu never offers these for.
        onCopyTerminalId: noopAsync,
        onCopyFilePath: noopAsync,
        onReloadAgent: actions.onReloadAgent,
        onRenameTab: actions.onRenameTab,
        onCloseTab: actions.onCloseTab,
        onCloseTabsBefore: actions.onCloseTabsBefore,
        onCloseTabsAfter: actions.onCloseTabsAfter,
        onCloseOtherTabs: actions.onCloseOtherTabs,
        onHideTab: actions.onHideTab,
      }),
    [actions, descriptors.length],
  );

  const openAgent = useCallback(
    (agentId: string) => () => {
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
      {rows.map((row, index) => (
        <SidebarWorkspaceAgentRowItem
          key={row.tabId}
          row={row}
          isActive={isWorkspaceActive && focusedTabId === row.tabId}
          label={agentTabLabel(titles?.get(row.agentId)?.title, row.agentId)}
          statusBucket={statusBuckets.get(row.agentId) ?? null}
          menuEntries={menuEntriesFor(descriptors[index], index)}
          multilineTitle={workspaceTitleMultiline}
          onPress={openAgent(row.agentId)}
        />
      ))}
      {actions.renameModal}
    </View>
  );
});

const SidebarWorkspaceAgentRowItem = memo(function SidebarWorkspaceAgentRowItem({
  row,
  isActive,
  label,
  statusBucket,
  menuEntries,
  multilineTitle,
  onPress,
}: SidebarWorkspaceAgentRowItemProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  return (
    // A View, not a Pressable: the row's press target and the menu's trigger are siblings, so the
    // web build never nests one button inside another.
    <View
      testID={`sidebar-workspace-agent-${row.tabId}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={[styles.row, isHovered && styles.rowHovered, isActive && styles.rowActive]}
    >
      <Pressable
        testID={`sidebar-workspace-agent-open-${row.tabId}`}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.tabs.menu.openFor", { label })}
        accessibilityState={accessibilityState}
        aria-selected={isActive}
        onPress={onPress}
        style={styles.openTarget}
      >
        <SidebarStatusSlot
          bucket={statusBucket}
          testID={`sidebar-workspace-agent-status-${row.tabId}`}
        />
        <Text
          numberOfLines={multilineTitle ? undefined : 1}
          style={[styles.label, isActive && styles.labelActive]}
          testID={`sidebar-workspace-agent-title-${row.tabId}`}
        >
          {label}
        </Text>
      </Pressable>
      <MobileTabTrailingAccessory
        menuTestIDBase={`sidebar-workspace-agent-menu-${row.tabId}`}
        presentationLabel={label}
        menuEntries={menuEntries}
      />
    </View>
  );
});

/**
 * Each agent's own state, keyed by agent id.
 *
 * Read from the same fields the tab strip's icon reads, so a row and the tab it stands for never
 * disagree about whether that agent is working or waiting on the user. The selector is shallow
 * because the map is rebuilt whenever an agent changes; returning a fresh object every call would
 * re-render the whole list on every store tick.
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
  // An open turn is what "working" means here: the daemon can leave `status` at running after the
  // turn is over, and the tab strip already prefers the turn's liveness over the raw status for
  // exactly that reason.
  const isTurnActive = selectAgentTurnPresentation(session, agent.id).isActive;
  return deriveSidebarStateBucket({
    status: isTurnActive ? "running" : agent.status,
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

function useActiveWorkspaceKey(serverId: string, workspaceId: string): boolean {
  const selection = useActiveWorkspaceSelection();
  return selection?.serverId === serverId && selection.workspaceId === workspaceId;
}

const styles = StyleSheet.create((theme) => ({
  // Pulled in on the left only. A row's own padding lives inside its background box, so without
  // this the agent row's selection surface would start at the same x as the workspace row's above
  // it and the two would read as one block. The right edge is left flush with the workspace row
  // so the ⋯ menu column stays a single vertical rail down the sidebar.
  list: {
    marginLeft: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  // One step deeper than the workspace row's own padding, so an agent reads as belonging to the
  // workspace above it rather than as a workspace in its own right. The whole step goes to the
  // left of the status slot, keeping the dot and the title on the same pair of rails.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingRight: theme.spacing[1],
    paddingLeft: theme.spacing[4],
    // The workspace row above rounds its own background, so an agent row that kept square
    // corners read as a different kind of thing rather than as a child of that row.
    borderRadius: theme.borderRadius.lg,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  // The same surface the workspace row's own selection uses, one step above hover. An accent
  // tint would read as state, and running is the state this row's ring already claims.
  rowActive: {
    backgroundColor: theme.colors.surfaceSidebarSelected,
  },
  // Row layout, not column: the slot shares the workspace row's gap, so an agent title starts
  // directly under the workspace title above it.
  openTarget: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  label: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  labelActive: {
    color: theme.colors.foreground,
  },
}));
