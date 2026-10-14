import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { collapsePromptWhitespace, type ActivePromptSource, type ChatOutlinePrompt } from "./model";

// Exact extension keeps compact web from resolving the platform-specific popover file.
const { PromptDetailContent } = require("./prompt-detail.tsx") as typeof import("./prompt-detail");

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
  /**
   * Reads a prompt's full text for the detail view. Callers that only need the compact
   * index can omit it; their rows keep jumping straight to the transcript.
   */
  onRequestPromptText?: (seq: number) => Promise<string | null>;
}

export function ChatOutlineSheet({
  prompts,
  activePrompt,
  visible,
  onClose,
  onJumpToPrompt,
  onRequestPromptText,
}: ChatOutlineSheetProps) {
  const { t } = useTranslation();
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const [selectedPromptSeq, setSelectedPromptSeq] = useState<number | null>(null);
  const selectedPrompt = useMemo(
    () => (selectedPromptSeq === null ? null : prompts.find((p) => p.seq === selectedPromptSeq)),
    [prompts, selectedPromptSeq],
  );

  useEffect(() => {
    if (!visible) setSelectedPromptSeq(null);
  }, [visible]);

  useEffect(() => {
    if (selectedPromptSeq !== null && selectedPrompt === undefined) setSelectedPromptSeq(null);
  }, [selectedPrompt, selectedPromptSeq]);

  const header = useMemo<SheetHeader>(() => {
    if (selectedPrompt && onRequestPromptText) {
      return {
        title: t("settings.appearance.chatOutline.title"),
        back: {
          onPress: () => setSelectedPromptSeq(null),
          label: t("common.actions.back"),
          accessibilityLabel: t("common.actions.back"),
        },
      };
    }
    return { title: t("settings.appearance.chatOutline.title") };
  }, [onRequestPromptText, selectedPrompt, t]);

  const handleJumpToPrompt = useCallback(
    (seq: number) => {
      onClose();
      onJumpToPrompt(seq);
    },
    [onClose, onJumpToPrompt],
  );

  const handleRowPress = useCallback(
    (seq: number) => {
      if (onRequestPromptText) {
        setSelectedPromptSeq(seq);
        return;
      }
      handleJumpToPrompt(seq);
    },
    [handleJumpToPrompt, onRequestPromptText],
  );

  const showDetail =
    selectedPrompt !== null && selectedPrompt !== undefined && !!onRequestPromptText;
  const selectedPromptIndex =
    selectedPrompt === null || selectedPrompt === undefined
      ? -1
      : prompts.findIndex((prompt) => prompt.seq === selectedPrompt.seq);

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible && prompts.length > 1}
      onClose={onClose}
      snapPoints={["75%", "92%"]}
      scrollable={!showDetail}
      testID="chat-outline-sheet"
    >
      {showDetail && selectedPrompt && onRequestPromptText ? (
        <PromptDetailContent
          prompt={selectedPrompt}
          index={selectedPromptIndex}
          total={prompts.length}
          onRequestPromptText={onRequestPromptText}
          onJumpToPrompt={onJumpToPrompt}
          onClose={onClose}
          style={styles.detail}
          contentStyle={styles.detailContent}
          actionsStyle={styles.detailActions}
          testID={`chat-outline-sheet-detail-${selectedPrompt.seq}`}
        />
      ) : (
        <View style={styles.list}>
          {prompts.map((prompt, index) => (
            <ChatOutlinePromptRow
              key={prompt.seq}
              index={index}
              total={prompts.length}
              prompt={prompt}
              isActive={prompt.seq === activeSeq}
              detailEnabled={!!onRequestPromptText}
              onOpenPrompt={handleRowPress}
              onJumpToPrompt={handleJumpToPrompt}
            />
          ))}
        </View>
      )}
    </AdaptiveModalSheet>
  );
}

function ChatOutlinePromptRow({
  index,
  total,
  prompt,
  isActive,
  detailEnabled,
  onOpenPrompt,
  onJumpToPrompt,
}: {
  index: number;
  total: number;
  prompt: ChatOutlinePrompt;
  isActive: boolean;
  detailEnabled: boolean;
  onOpenPrompt: (seq: number) => void;
  onJumpToPrompt: (seq: number) => void;
}) {
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const handlePress = useCallback(() => {
    if (detailEnabled) onOpenPrompt(prompt.seq);
    else onJumpToPrompt(prompt.seq);
  }, [detailEnabled, onJumpToPrompt, onOpenPrompt, prompt.seq]);
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
  detail: {
    flex: 1,
    minHeight: 0,
  },
  detailContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  detailActions: {
    paddingHorizontal: 0,
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
