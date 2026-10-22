import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MessageSquareText, Settings2 } from "lucide-react-native";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { iconButtonChromeStyle } from "@/components/ui/icon-button-chrome";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedSettings2 = withUnistyles(Settings2, mutedIconMapping);
const ThemedMessageSquareText = withUnistyles(MessageSquareText, mutedIconMapping);

/** Pressable reports `hovered` on web only, so the shared state type widens it as optional. */
type ChipPressableState = PressableStateCallbackType & { hovered?: boolean };

interface QuickRepliesBarProps {
  replies: QuickReply[];
  onSelect: (text: string) => void;
  onEdit: () => void;
  /** The sheet already carries the title in its header, so it hides the bar's own. */
  showTitle?: boolean;
}

/**
 * Quick replies as pressable chips: the desktop composer's right gutter, and the body of the
 * compact sheet. Chips run left to right and wrap; each shows the reply's full text on one line,
 * ellipsized at the tail when it cannot fit the row, and sends immediately. The manage button is
 * always there, so an empty list still has a way to add the first reply.
 */
export function QuickRepliesBar({
  replies,
  onSelect,
  onEdit,
  showTitle = true,
}: QuickRepliesBarProps) {
  const { t } = useTranslation();
  const editIcon = useMemo(
    () => <ThemedSettings2 size={ICON_SIZE.lg} uniProps={mutedIconMapping} />,
    [],
  );
  const editChipStyle = useCallback(
    ({ pressed, hovered = false }: ChipPressableState) =>
      iconButtonChromeStyle({ size: "large", state: { hovered: Boolean(hovered), pressed } }),
    [],
  );
  const editButton = (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.manage")}
          testID="quick-replies-edit"
          onPress={onEdit}
          style={editChipStyle}
        >
          {editIcon}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" offset={8}>
        <Text style={styles.tooltipText}>{t("common.actions.manage")}</Text>
      </TooltipContent>
    </Tooltip>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={reply.text}
      testID={`quick-reply-${reply.id}`}
      onPress={handlePress}
      style={chipStyle}
    >
      <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
        {reply.text}
      </Text>
    </Pressable>
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
    alignContent: "flex-start",
    justifyContent: "flex-start",
    gap: theme.spacing[0.5],
    minWidth: 0,
  },
  chip: {
    flexShrink: 1,
    minWidth: 0,
    /** The label grows with its text but never past the row, so the tail ellipsis can kick in. */
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
  chipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
