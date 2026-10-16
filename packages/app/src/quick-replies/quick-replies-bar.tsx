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
}

/**
 * Desktop quick replies, tiled to the right of the composer input. Chips wrap when they run
 * out of width; each shows the first five characters and the full text on hover, and pressing
 * one sends the full text immediately.
 */
export function QuickRepliesBar({ replies, onSelect, onEdit }: QuickRepliesBarProps) {
  const { t } = useTranslation();
  const editIcon = useMemo(
    () => <ThemedSettings2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />,
    [],
  );
  return (
    <View style={styles.bar} testID="quick-replies-bar">
      {replies.map((reply) => (
        <QuickReplyChip key={reply.id} reply={reply} onSelect={onSelect} />
      ))}
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
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    alignContent: "flex-start",
    gap: theme.spacing[1],
    maxWidth: "38%",
    marginLeft: theme.spacing[1],
  },
  chip: {
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
