import { useCallback } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MessageSquareText, Settings2 } from "lucide-react-native";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { useTranslation } from "react-i18next";
import { PressHighlight } from "@/components/ui/press-highlight";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedSettings2 = withUnistyles(Settings2, mutedIconMapping);
const ThemedMessageSquareText = withUnistyles(MessageSquareText, mutedIconMapping);

/** web 上才会有 hovered，所以共用状态类型把它放宽成可选。 */
type ChipPressableState = PressableStateCallbackType & { hovered?: boolean };

interface QuickRepliesBarProps {
  replies: QuickReply[];
  onSelect: (text: string) => void;
  onEdit: () => void;
  /** 紧凑模式的弹层头部已经带了标题，这里就不再重复。 */
  showTitle?: boolean;
}

/**
 * 常用回复的快捷条：桌面端住窗格右侧留缝，窄屏住输入框上方。每条一行显示，放不下时
 * 尾部省略；管理入口常驻，空列表也还有地方加第一条。
 */
export function QuickRepliesBar({
  replies,
  onSelect,
  onEdit,
  showTitle = true,
}: QuickRepliesBarProps) {
  const { t } = useTranslation();
  const editButton = (
    <ToolbarButton label={t("common.actions.manage")} onPress={onEdit} testID="quick-replies-edit">
      <ThemedSettings2 size={ICON_SIZE.md} uniProps={mutedIconMapping} />
    </ToolbarButton>
  );

  return (
    <View style={styles.bar} testID="quick-replies-bar">
      <View style={styles.chips}>
        {replies.map((reply) => (
          <QuickReplyChip key={reply.id} reply={reply} onSelect={onSelect} />
        ))}
        {showTitle ? null : editButton}
      </View>
      {showTitle ? (
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <ThemedMessageSquareText size={ICON_SIZE.md} uniProps={mutedIconMapping} />
            <Text style={styles.title} numberOfLines={1}>
              {t("composer.quickReplies.title")}
            </Text>
          </View>
          {editButton}
        </View>
      ) : null}
    </View>
  );
}

function QuickReplyChip({
  reply,
  onSelect,
}: {
  reply: QuickReply;
  onSelect: (text: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(reply.text), [onSelect, reply.text]);
  const chipStyle = useCallback(
    ({ pressed, hovered = false }: ChipPressableState) => [
      styles.chip,
      Boolean(hovered) && styles.chipHovered,
      pressed && styles.chipPressed,
    ],
    [],
  );
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={reply.text}
      testID={`quick-reply-${reply.id}`}
      onPress={handlePress}
      style={chipStyle}
      highlightStyle={styles.chipHighlight}
    >
      <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
        {reply.text}
      </Text>
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  bar: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: theme.spacing[2],
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    // 按钮少时从底部往上排，不要贴着上方的备忘；多到撑满时行为不变。
    alignContent: "flex-end",
    justifyContent: "flex-start",
    flex: 1,
    gap: theme.spacing[0.5],
    minWidth: 0,
  },
  chip: {
    flexShrink: 1,
    minWidth: 0,
    /** 宽度跟着文字走但不超过整行，尾部省略才有机会出现。 */
    maxWidth: "100%",
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    backgroundColor: theme.colors.surface1,
  },
  chipHovered: {
    backgroundColor: theme.colors.surface2,
  },
  chipPressed: {
    backgroundColor: theme.colors.surface0,
  },
  // 原生没有 hover，按下时靠这一层底色给出反馈。
  chipHighlight: {
    backgroundColor: theme.colors.surface3,
  },
  chipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
  },
}));
