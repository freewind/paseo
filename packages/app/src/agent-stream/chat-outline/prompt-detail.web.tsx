import React, { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Copy, X } from "lucide-react-native";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import {
  PROMPT_DETAIL_GAP,
  PROMPT_DETAIL_MAX_HEIGHT,
  PROMPT_DETAIL_WIDTH,
  TEXT_ROW_LINE_HEIGHT,
  type ChatOutlinePrompt,
} from "./model";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureElement(element: View): Promise<Rect> {
  return new Promise((resolve) => {
    element.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

/** Window measurements must be converted to the panel's local coordinate system. */
function computePopoverPosition(rowRect: Rect, panelRect: Rect) {
  if (panelRect.width <= 0 || panelRect.height <= 0) return null;
  const width = Math.min(PROMPT_DETAIL_WIDTH, panelRect.width);
  const maxHeight = Math.min(PROMPT_DETAIL_MAX_HEIGHT, panelRect.height);
  const left = Math.min(
    Math.max(0, rowRect.x - panelRect.x - width - PROMPT_DETAIL_GAP),
    panelRect.width - width,
  );
  const top = Math.min(Math.max(0, rowRect.y - panelRect.y), panelRect.height - maxHeight);
  return { left, top, width, maxHeight };
}

interface PromptDetailPopoverProps {
  prompt: ChatOutlinePrompt;
  index: number;
  total: number;
  preview: string;
  onRequestPromptText: (seq: number) => Promise<string | null>;
  rowRef: React.RefObject<View | null>;
  panelRef: React.RefObject<View | null>;
  onJumpToPrompt: (seq: number) => void;
  onClose: () => void;
}

/** The body preserves the original prompt's whitespace; only the outline rows collapse it. */
export function PromptDetailPopover({
  prompt,
  index,
  total,
  preview,
  onRequestPromptText,
  rowRef,
  panelRef,
  onJumpToPrompt,
  onClose,
}: PromptDetailPopoverProps): ReactElement | null {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [frame, setFrame] = useState<ReturnType<typeof computePopoverPosition>>(null);
  const measureEpoch = useRef(0);
  const textEpoch = useRef(0);

  useEffect(() => {
    const request = measureEpoch;
    const epoch = ++request.current;
    const row = rowRef.current;
    const panel = panelRef.current;
    if (!row || !panel) return undefined;
    void Promise.all([measureElement(row), measureElement(panel)]).then(([rowRect, panelRect]) => {
      if (request.current === epoch) setFrame(computePopoverPosition(rowRect, panelRect));
      return null;
    });
    return () => {
      request.current++;
    };
  }, [panelRef, prompt.seq, rowRef]);

  useEffect(() => {
    const request = textEpoch;
    const epoch = ++request.current;
    setIsLoading(true);
    setFullText(null);
    void onRequestPromptText(prompt.seq).then((text) => {
      if (request.current === epoch) {
        setFullText(text);
        setIsLoading(false);
      }
      return null;
    });
    return () => {
      request.current++;
    };
  }, [onRequestPromptText, prompt.seq]);

  const handleJump = useCallback(() => {
    onJumpToPrompt(prompt.seq);
    onClose();
  }, [onClose, onJumpToPrompt, prompt.seq]);

  // The popover exists to show the whole prompt, so copy the loaded text and fall back to
  // the index preview only while the daemon read is still in flight.
  const handleCopy = useCallback(async () => {
    const text = fullText ?? preview;
    if (!text) return;
    try {
      await copyToClipboard(text);
      toast.copied();
    } catch {
      toast.error(t("common.errors.unableToCopy"));
    }
  }, [fullText, preview, t, toast]);

  // Mount only after measurement, so no frame paints at an unmeasured position.
  if (!frame) return null;

  return (
    <View
      collapsable={false}
      style={[styles.popover, inlineUnistylesStyle(frame)]}
      role="dialog"
      accessibilityLabel={`${index + 1} of ${total}: ${preview}`}
      testID={`chat-outline-prompt-detail-${prompt.seq}`}
    >
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator
        testID={`chat-outline-prompt-detail-scroll-${prompt.seq}`}
      >
        <Text style={styles.bodyText}>
          {isLoading ? t("common.loading") : (fullText ?? preview)}
        </Text>
      </ScrollView>
      <View style={styles.actions} testID={`chat-outline-prompt-detail-actions-${prompt.seq}`}>
        <Button
          variant="secondary"
          size="xs"
          leftIcon={Copy}
          onPress={handleCopy}
          testID={`chat-outline-prompt-detail-copy-${prompt.seq}`}
        >
          {`🌿 ${t("common.actions.copy")}`}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onPress={handleJump}
          testID={`chat-outline-prompt-detail-jump-${prompt.seq}`}
        >
          {t("agentStream.chatOutline.jumpToPrompt")}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          leftIcon={X}
          onPress={onClose}
          accessibilityLabel={t("common.actions.close")}
          testID={`chat-outline-prompt-detail-close-${prompt.seq}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // A panel-local sibling stays above the rail without escaping the chat's lifecycle.
  popover: {
    position: "absolute",
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    zIndex: 3,
    ...theme.shadow.md,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  bodyText: {
    fontSize: theme.fontSize.base,
    lineHeight: TEXT_ROW_LINE_HEIGHT,
    color: theme.colors.foreground,
  },
  actions: {
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
}));
