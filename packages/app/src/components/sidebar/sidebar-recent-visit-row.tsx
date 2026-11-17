import { useCallback, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useMenuContext } from "@/components/ui/menu";
import { PressHighlight } from "@/components/ui/press-highlight";

interface SidebarRecentVisitRowProps {
  testID: string;
  accessibilityLabel: string;
  /** 第一行左侧：项目名。主机离线时拿不到，这一侧就留空。 */
  projectName: string | null;
  /** 第一行右侧的标记组：条数、已归档、子 agent、当前、更新于。 */
  badges: ReactNode;
  title: string;
  lastUserMessage: string | null;
  onSelect: () => void;
}

/**
 * 最近访问的一行，三行信息：项目名与标记、会话标题、最后一条有效的用户消息。
 *
 * 不用 `MenuItem`：它的内容区固定是标题加描述，而第一行要在同一行里左右分栏，
 * 塞不进去。按 `ComposerTrackRow` 的先例自建——悬停挂在外层 `View`、按压交给
 * 内层 `Pressable`（见 docs/hover.md），选中交给菜单引擎，由它决定是否关闭。
 */
export function SidebarRecentVisitRow({
  testID,
  accessibilityLabel,
  projectName,
  badges,
  title,
  lastUserMessage,
  onSelect,
}: SidebarRecentVisitRowProps) {
  const { selectItem } = useMenuContext("SidebarRecentVisitRow");
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePress = useCallback(() => selectItem(onSelect, true), [onSelect, selectItem]);
  return (
    // 悬停挂在外层 View、按压交给 PressHighlight，与侧栏其它行同一套（见 docs/hover.md）。
    <View
      style={[styles.row, isHovered && styles.rowHighlighted]}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <PressHighlight
        testID={testID}
        accessibilityRole="menuitem"
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        style={styles.press}
        highlightStyle={styles.rowHighlighted}
      >
        <View style={styles.header}>
          {projectName ? (
            <Text numberOfLines={1} style={styles.project} testID={`${testID}-project`}>
              {projectName}
            </Text>
          ) : null}
          <View style={styles.badges} testID={`${testID}-badges`}>
            {badges}
          </View>
        </View>
        <Text numberOfLines={1} style={styles.title} testID={`${testID}-title`}>
          {title}
        </Text>
        {lastUserMessage ? (
          <Text numberOfLines={2} style={styles.message} testID={`${testID}-message`}>
            {lastUserMessage}
          </Text>
        ) : null}
      </PressHighlight>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // 与菜单行的填充同一套数值：一行落在同一列里，不因为自建而偏出去。
  row: {
    marginHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  rowHighlighted: {
    backgroundColor: theme.colors.surface2,
  },
  press: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[1],
    // 菜单行本身带一墨透明边框，这里跟着留一墨，否则文字会比其他行左移。
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  // 项目名是这一行唯一可收缩的部分：右侧标记一旦压缩就失去一眼可读的作用。
  project: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  badges: {
    marginLeft: "auto",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    fontSize: theme.fontSize.base,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  message: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    color: theme.colors.foregroundMuted,
  },
}));
