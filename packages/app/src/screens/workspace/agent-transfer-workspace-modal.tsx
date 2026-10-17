import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Check } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";

export interface TransferWorkspaceOption {
  key: string;
  label: string;
  detail?: string;
}

export interface AgentTransferWorkspaceModalProps {
  visible: boolean;
  agentTitle: string;
  options: readonly TransferWorkspaceOption[];
  onClose: () => void;
  onSelect: (option: TransferWorkspaceOption) => void;
  testID?: string;
}

/**
 * Pick a destination workspace for an agent transfer. One option per visible
 * workspace plus one per project without one; the selected row is the option key.
 */
export const AgentTransferWorkspaceModal = memo(function AgentTransferWorkspaceModal({
  visible,
  agentTitle,
  options,
  onClose,
  onSelect,
  testID,
}: AgentTransferWorkspaceModalProps) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: t("workspace.tabs.transfer.title", { agent: agentTitle }),
    }),
    [agentTitle, t],
  );

  const handleOptionPress = useCallback(
    (key: string) => setSelectedKey((current) => (current === key ? null : key)),
    [],
  );

  const handleConfirm = useCallback(() => {
    const selected = options.find((option) => option.key === selectedKey);
    if (!selected) return;
    onClose();
    onSelect(selected);
  }, [onClose, onSelect, options, selectedKey]);

  return (
    <AdaptiveModalSheet visible={visible} onClose={onClose} header={sheetHeader} testID={testID}>
      <View style={styles.body}>
        {options.map((option) => (
          <TransferOptionRow
            key={option.key}
            option={option}
            isSelected={option.key === selectedKey}
            testIDBase={testID ?? "agent-transfer-workspace"}
            onPress={handleOptionPress}
          />
        ))}
        <Pressable
          style={[styles.confirmButton, selectedKey === null && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={selectedKey === null}
          accessibilityRole="button"
          accessibilityLabel={t("workspace.tabs.transfer.confirm")}
          testID={testID ? `${testID}-confirm` : "agent-transfer-workspace-confirm"}
        >
          <Text style={styles.confirmText}>{t("workspace.tabs.transfer.confirm")}</Text>
        </Pressable>
      </View>
    </AdaptiveModalSheet>
  );
});

const ThemedCheck = withUnistyles(Check, (theme) => ({ color: theme.colors.foreground }));

const TransferOptionRow = memo(function TransferOptionRow({
  option,
  isSelected,
  testIDBase,
  onPress,
}: {
  option: TransferWorkspaceOption;
  isSelected: boolean;
  testIDBase: string;
  onPress: (key: string) => void;
}) {
  const { t: _t } = useTranslation();
  void _t;
  const handlePress = useCallback(() => onPress(option.key), [option.key, onPress]);
  return (
    <Pressable
      style={[styles.optionRow, isSelected && styles.optionRowSelected]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      testID={`${testIDBase}-option-${option.key}`}
    >
      <View style={styles.optionText}>
        <Text style={styles.optionLabel} numberOfLines={1}>
          {option.label}
        </Text>
        {option.detail ? (
          <Text style={styles.optionDetail} numberOfLines={1}>
            {option.detail}
          </Text>
        ) : null}
      </View>
      {isSelected ? <ThemedCheck size={16} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  body: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  optionRowSelected: {
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface2,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  optionDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  confirmButton: {
    marginTop: theme.spacing[2],
    alignItems: "center",
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
}));
