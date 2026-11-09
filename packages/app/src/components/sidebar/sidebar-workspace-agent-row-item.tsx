import { memo, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { isNative, isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { SidebarWorkspaceTrailingActionSlot } from "@/components/sidebar/sidebar-workspace-row-content";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { SidebarStatusSlot } from "@/components/sidebar/sidebar-status-slot";
import { MobileTabTrailingAccessory } from "@/screens/workspace/workspace-tab-trailing-accessory";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";
import type { SidebarWorkspaceAgentRow } from "@/components/sidebar/sidebar-workspace-agent-rows";
import { HighlightedText } from "@/components/ui/highlighted-text";
import type { MatchRange } from "@getpaseo/protocol/search/text-match";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

interface SidebarWorkspaceAgentRowItemProps {
  row: SidebarWorkspaceAgentRow;
  isActive: boolean;
  label: string;
  /** 名称搜索命中标题时的区间；不搜索或没命中时不传。 */
  highlightRanges?: readonly MatchRange[];
  /** agent 自身状态，与 tab 栏图标的读法一致。 */
  statusBucket: SidebarStateBucket | null;
  menuEntries: WorkspaceTabMenuEntry[];
  onOpenAgent: (agentId: string) => void;
}

export const SidebarWorkspaceAgentRowItem = memo(function SidebarWorkspaceAgentRowItem({
  row,
  isActive,
  label,
  highlightRanges,
  statusBucket,
  menuEntries,
  onOpenAgent,
}: SidebarWorkspaceAgentRowItemProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const isCompact = useIsCompactFormFactor();
  // 与 workspace 行同一个算法：原生或紧凑布局没有 hover，菜单只能常显。
  const isTouchPlatform = isNative || isCompact;
  const showTime = Boolean(row.lastActivityAt) && !isTouchPlatform;
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
        <HighlightedText
          text={label}
          ranges={highlightRanges}
          style={[styles.label, isActive && styles.labelActive]}
          testID={`sidebar-workspace-agent-title-${row.tabId}`}
        />
      </PressHighlight>
      <SidebarWorkspaceTrailingActionSlot reserveWidth={showTime}>
        {showTime && row.lastActivityAt ? (
          <AgentTrailingTime date={row.lastActivityAt} hidden={isHovered} tabId={row.tabId} />
        ) : null}
        <View
          style={
            showTime
              ? [styles.trailingMenuResting, !isHovered && styles.trailingMenuHidden]
              : undefined
          }
        >
          <MobileTabTrailingAccessory
            variant="sidebar"
            menuTestIDBase={`sidebar-workspace-agent-menu-${row.tabId}`}
            presentationLabel={label}
            menuEntries={menuEntries}
          />
        </View>
      </SidebarWorkspaceTrailingActionSlot>
    </View>
  );
});

/** 行尾时间：与菜单同占一个槽位，悬停时让位给菜单。 */
function AgentTrailingTime({
  date,
  hidden,
  tabId,
}: {
  date: Date;
  hidden: boolean;
  tabId: string;
}) {
  const label = useCompactTimeAgo(date);
  return (
    <Text
      style={[styles.trailingTime, hidden && styles.trailingTimeHidden]}
      numberOfLines={1}
      testID={`sidebar-workspace-agent-time-${tabId}`}
    >
      {label}
    </Text>
  );
}
const styles = StyleSheet.create((theme) => ({
  trailingTime: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
  trailingTimeHidden: {
    opacity: 0,
  },
  // 有时间时菜单一直浮在时间上方（只切换透明度），悬停不会把行撑高、也不会把按钮挤到下一行。
  trailingMenuResting: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    justifyContent: "center",
  },
  trailingMenuHidden: {
    opacity: 0,
  },
  // 比 workspace 行自身的 padding 再深一级，agent 才读作归属于上方 workspace，而不是自己就是
  // 一个 workspace。这一级全加在状态槽左边，圆点和标题仍落在同两条竖轨上。
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingRight: theme.spacing[3],
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
    // 标题可能是一整串没有空格的字符（如 40 位十六进制），web 上这种串的最小宽度等于整串
    // 宽度，不加 minWidth 0 就会撑破行右边缘，把状态圆点挤到角落。
    minWidth: 0,
    ...(isWeb ? { overflowWrap: "anywhere" as const } : {}),
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  labelActive: {
    color: theme.colors.foreground,
  },
}));
