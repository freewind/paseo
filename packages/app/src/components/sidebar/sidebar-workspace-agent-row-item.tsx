import { memo, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SidebarStatusSlot } from "@/components/sidebar/sidebar-status-slot";
import { MobileTabTrailingAccessory } from "@/screens/workspace/workspace-tab-trailing-accessory";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";
import type { SidebarWorkspaceAgentRow } from "@/components/sidebar/sidebar-workspace-agent-rows";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

interface SidebarWorkspaceAgentRowItemProps {
  row: SidebarWorkspaceAgentRow;
  isActive: boolean;
  label: string;
  /** agent 自身状态，与 tab 栏图标的读法一致。 */
  statusBucket: SidebarStateBucket | null;
  menuEntries: WorkspaceTabMenuEntry[];
  onOpenAgent: (agentId: string) => void;
}

export const SidebarWorkspaceAgentRowItem = memo(function SidebarWorkspaceAgentRowItem({
  row,
  isActive,
  label,
  statusBucket,
  menuEntries,
  onOpenAgent,
}: SidebarWorkspaceAgentRowItemProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const handlePress = useCallback(() => onOpenAgent(row.agentId), [onOpenAgent, row.agentId]);
  return (
    // 用 View 而不是 Pressable：行的点击区和菜单触发器是兄弟节点，web 端才不会把 button 套 button。
    <View
      testID={`sidebar-workspace-agent-${row.tabId}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={[styles.row, isHovered && styles.rowHovered, isActive && styles.rowActive]}
    >
      <PressHighlight
        testID={`sidebar-workspace-agent-open-${row.tabId}`}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.tabs.menu.openFor", { label })}
        accessibilityState={accessibilityState}
        aria-selected={isActive}
        onPress={handlePress}
        style={styles.openTarget}
      >
        <SidebarStatusSlot
          bucket={statusBucket}
          testID={`sidebar-workspace-agent-status-${row.tabId}`}
        />
        <Text
          numberOfLines={1}
          style={[styles.label, isActive && styles.labelActive]}
          testID={`sidebar-workspace-agent-title-${row.tabId}`}
        >
          {label}
        </Text>
      </PressHighlight>
      <MobileTabTrailingAccessory
        menuTestIDBase={`sidebar-workspace-agent-menu-${row.tabId}`}
        presentationLabel={label}
        menuEntries={menuEntries}
      />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  // 比 workspace 行自身的 padding 再深一级，agent 才读作归属于上方 workspace，而不是自己就是
  // 一个 workspace。这一级全加在状态槽左边，圆点和标题仍落在同两条竖轨上。
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingRight: theme.spacing[1],
    paddingLeft: theme.spacing[4],
    // 上方 workspace 行的背景是圆角的，agent 行若保留直角会被读成另一种东西，而不是那一行的子项。
    borderRadius: theme.borderRadius.lg,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  // 与 workspace 行选中态同一层背景，比 hover 高一级。用 accent 色会被读成状态，而 running
  // 已经是本行外圈声称的状态。
  rowActive: {
    backgroundColor: theme.colors.surfaceSidebarSelected,
  },
  // 用横排而不是竖排：状态槽共用 workspace 行的 gap，agent 标题才正好起在上方 workspace 标题下面。
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
