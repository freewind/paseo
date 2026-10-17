import { useCallback, useMemo } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import type { Theme } from "@/styles/theme";
import { QuickRepliesBar } from "./quick-replies-bar";

interface QuickRepliesSheetProps {
  visible: boolean;
  replies: QuickReply[];
  onSelect: (text: string) => void;
  onEdit: () => void;
  onClose: () => void;
}

/**
 * The compact entry's destination. It reuses the desktop bar's chips rather than restoring the
 * row-per-reply menu: choosing one sends immediately and closes the sheet, and managing closes
 * the sheet first so the editor never opens underneath a live sheet.
 */
export function QuickRepliesSheet({
  visible,
  replies,
  onSelect,
  onEdit,
  onClose,
}: QuickRepliesSheetProps) {
  const { t } = useTranslation();
  const header = useMemo(() => ({ title: t("composer.quickReplies.title") }), [t]);
  const handleSelect = useCallback(
    (text: string) => {
      onClose();
      onSelect(text);
    },
    [onClose, onSelect],
  );
  const handleEdit = useCallback(() => {
    onClose();
    onEdit();
  }, [onClose, onEdit]);

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      testID="quick-replies-sheet"
    >
      {replies.length === 0 ? (
        <Text style={styles.empty}>{t("composer.quickReplies.empty")}</Text>
      ) : null}
      <QuickRepliesBar
        replies={replies}
        onSelect={handleSelect}
        onEdit={handleEdit}
        showTitle={false}
      />
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[3],
  },
}));
