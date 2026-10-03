import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { findFocusedWorkspaceTabId } from "@/components/sidebar/sidebar-workspace-agent-rows";
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

export interface SidebarWorkspaceAgentListProps {
  workspace: SidebarWorkspaceEntry;
}

interface SidebarWorkspaceAgentRowItemProps {
  row: SidebarWorkspaceAgentRow;
  isActive: boolean;
  label: string;
  menuEntries: WorkspaceTabMenuEntry[];
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
  const rows = useSidebarWorkspaceAgentRows(workspaceKey);
  const focusedTabId = useFocusedWorkspaceTabId(workspaceKey);
  const isWorkspaceActive = useActiveWorkspaceKey(serverId, workspaceId);
  const titles = useSessionStore((state) => state.sessions[serverId]?.agents ?? null);
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
        // Unreachable: the list only holds agent tabs, which the menu never offers these for.
        onCopyTerminalId: noopAsync,
        onCopyFilePath: noopAsync,
        onReloadAgent: actions.onReloadAgent,
        onRenameTab: actions.onRenameTab,
        onCloseTab: actions.onCloseTab,
        onCloseTabsBefore: actions.onCloseTabsBefore,
        onCloseTabsAfter: actions.onCloseTabsAfter,
        onCloseOtherTabs: actions.onCloseOtherTabs,
      }),
    [actions, descriptors.length],
  );

  const openAgent = useCallback(
    (agentId: string) => () => {
      navigateToAgent({ serverId, agentId, workspaceId });
    },
    [serverId, workspaceId],
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
          menuEntries={menuEntriesFor(descriptors[index], index)}
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
  menuEntries,
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
      style={[styles.row, (isHovered || isActive) && styles.rowActive]}
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
        <Text numberOfLines={1} style={[styles.label, isActive && styles.labelActive]}>
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
  list: {
    marginLeft: 28,
    paddingVertical: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingRight: theme.spacing[1],
    paddingLeft: theme.spacing[2],
  },
  rowActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  openTarget: {
    flex: 1,
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
