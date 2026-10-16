import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MessageSquareText, Pencil } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo } from "react";
import type { QuickReply } from "@getpaseo/protocol/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedMessageSquareText = withUnistyles(MessageSquareText, mutedIconMapping);
const ThemedPencil = withUnistyles(Pencil, mutedIconMapping);

interface QuickRepliesMenuProps {
  replies: QuickReply[];
  onSelect: (text: string) => void;
  onEdit: () => void;
}

/**
 * Mobile quick replies behind a single icon button in the composer toolbar. Each reply is one
 * row, clipped at the row's width; selecting one closes the sheet and sends the full text.
 */
export function QuickRepliesMenu({ replies, onSelect, onEdit }: QuickRepliesMenuProps) {
  const { t } = useTranslation();
  const pencilLeading = useMemo(
    () => <ThemedPencil size={ICON_SIZE.sm} uniProps={mutedIconMapping} />,
    [],
  );
  const editRow = useMemo(
    () => (
      <DropdownMenuItem leading={pencilLeading} onSelect={onEdit} testID="quick-replies-edit">
        {t("composer.quickReplies.edit")}
      </DropdownMenuItem>
    ),
    [onEdit, pencilLeading, t],
  );
  return (
    <DropdownMenu compactMode="sheet">
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            accessibilityLabel={t("composer.quickReplies.title")}
            accessibilityRole="button"
            testID="quick-replies-button"
          >
            {({ hovered }: { hovered?: boolean }) => (
              <View style={[styles.button, hovered && styles.buttonHovered]}>
                <ThemedMessageSquareText size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
              </View>
            )}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{t("composer.quickReplies.title")}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="end"
        offset={8}
        minWidth={240}
        testID="quick-replies-menu"
        sheetTitle={t("composer.quickReplies.title")}
      >
        {replies.map((reply) => (
          <QuickReplyMenuRow key={reply.id} reply={reply} onSelect={onSelect} />
        ))}
        {replies.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>{t("composer.quickReplies.empty")}</Text>
          </View>
        ) : null}
        {editRow}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuickReplyMenuRow({
  reply,
  onSelect,
}: {
  reply: QuickReply;
  onSelect: (text: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(reply.text), [onSelect, reply.text]);
  return (
    <DropdownMenuItem testID={`quick-reply-${reply.id}`} onSelect={handleSelect}>
      <Text style={styles.rowText} numberOfLines={1}>
        {reply.text}
      </Text>
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  button: {
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  buttonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    flexShrink: 1,
  },
  emptyRow: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
