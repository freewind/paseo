import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Settings2 } from "lucide-react-native";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { truncateQuickReplyLabel } from "./truncate";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedSettings2 = withUnistyles(Settings2, mutedIconMapping);

interface QuickRepliesBarProps {
  replies: QuickReply[];
  onSelect: (text: string) => void;
  onEdit: () => void;
  /** The sheet already carries the title in its header, so it hides the bar's own. */
  showTitle?: boolean;
}

/**
 * Quick replies as pressable chips: the desktop composer's right gutter, and the body of the
 * compact sheet. Chips run left to right and wrap; each shows the first five characters, the full
 * text on hover and to assistive tech, and sends immediately. The manage button is always there,
 * so an empty list still has a way to add the first reply.
 */
export function QuickRepliesBar({
  replies,
  onSelect,
  onEdit,
  showTitle = true,
}: QuickRepliesBarProps) {
  const { t } = useTranslation();
  const editIcon = useMemo(
    () => <ThemedSettings2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />,
    [],
  );
  const editButton = (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("composer.quickReplies.edit")}
          testID="quick-replies-edit"
          onPress={onEdit}
          style={styles.editChip}
        >
          {editIcon}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" offset={8}>
        <Text style={styles.tooltipText}>{t("composer.quickReplies.edit")}</Text>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <View style={styles.bar} testID="quick-replies-bar">
      {showTitle ? (
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {t("composer.quickReplies.title")}
          </Text>
          {editButton}
        </View>
      ) : null}
      <View style={styles.chips}>
        {replies.map((reply) => (
          <QuickReplyChip key={reply.id} reply={reply} onSelect={onSelect} />
        ))}
        {showTitle ? null : editButton}
      </View>
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
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reply.text}
          testID={`quick-reply-${reply.id}`}
          onPress={handlePress}
          style={styles.chip}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {truncateQuickReplyLabel(reply.text)}
          </Text>
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" offset={8}>
        <Text style={styles.tooltipText}>{reply.text}</Text>
      </TooltipContent>
    </Tooltip>
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
    fontSize: theme.fontSize.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    alignContent: "flex-start",
    justifyContent: "flex-start",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  chip: {
    flexShrink: 1,
    minWidth: 0,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
  },
  chipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  editChip: {
    flexShrink: 0,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
