import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { collapsePromptWhitespace, type ActivePromptSource, type ChatOutlinePrompt } from "./model";

export interface ChatOutlineSheetControllerInput {
  isCompact: boolean;
  isActive: boolean;
  enabled: boolean;
  agentId: string;
  timelineEpoch: string | null;
  promptCount: number;
  onAvailabilityChange?: (available: boolean) => void;
}

export function useChatOutlineSheetController({
  isCompact,
  isActive,
  enabled,
  agentId,
  timelineEpoch,
  promptCount,
  onAvailabilityChange,
}: ChatOutlineSheetControllerInput) {
  const [visible, setVisible] = useState(false);
  const available = isCompact && isActive && enabled && promptCount > 1;
  const open = useCallback(() => {
    if (available) setVisible(true);
  }, [available]);
  const close = useCallback(() => setVisible(false), []);

  useEffect(() => {
    onAvailabilityChange?.(available);
  }, [available, onAvailabilityChange]);
  useEffect(() => {
    setVisible(false);
  }, [agentId, timelineEpoch]);
  useEffect(() => {
    if (!available) setVisible(false);
  }, [available]);

  return { available, visible: visible && available, open, close };
}

export interface ChatOutlineSheetProps {
  prompts: ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  visible: boolean;
  onClose: () => void;
  onJumpToPrompt: (seq: number) => void;
}

export function ChatOutlineSheet({
  prompts,
  activePrompt,
  visible,
  onClose,
  onJumpToPrompt,
}: ChatOutlineSheetProps) {
  const { t } = useTranslation();
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.appearance.chatOutline.title") }),
    [t],
  );

  const handleJumpToPrompt = useCallback(
    (seq: number) => {
      onClose();
      onJumpToPrompt(seq);
    },
    [onClose, onJumpToPrompt],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible && prompts.length > 1}
      onClose={onClose}
      snapPoints={["75%", "92%"]}
      testID="chat-outline-sheet"
    >
      <View style={styles.list}>
        {prompts.map((prompt, index) => (
          <ChatOutlinePromptRow
            key={prompt.seq}
            index={index}
            total={prompts.length}
            prompt={prompt}
            isActive={prompt.seq === activeSeq}
            onJumpToPrompt={handleJumpToPrompt}
          />
        ))}
      </View>
    </AdaptiveModalSheet>
  );
}

function ChatOutlinePromptRow({
  index,
  total,
  prompt,
  isActive,
  onJumpToPrompt,
}: {
  index: number;
  total: number;
  prompt: ChatOutlinePrompt;
  isActive: boolean;
  onJumpToPrompt: (seq: number) => void;
}) {
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const handlePress = useCallback(() => onJumpToPrompt(prompt.seq), [onJumpToPrompt, prompt.seq]);
  const handleStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.row,
      isActive && styles.rowActive,
      pressed && styles.rowPressed,
    ],
    [isActive],
  );

  return (
    <Pressable
      style={handleStyle}
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      aria-selected={isActive}
      accessibilityLabel={`${index + 1} of ${total}: ${prompt.preview}`}
      testID={`chat-outline-prompt-${prompt.seq}`}
    >
      <Text style={[styles.index, isActive && styles.indexActive]}>{index + 1}</Text>
      <Text style={[styles.preview, isActive && styles.previewActive]} numberOfLines={3}>
        {collapsePromptWhitespace(prompt.preview)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[2],
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  rowActive: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  index: {
    width: 28,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  indexActive: {
    color: theme.colors.foreground,
  },
  preview: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  previewActive: {
    color: theme.colors.foreground,
  },
}));
