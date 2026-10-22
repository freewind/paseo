import React, { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Copy, X } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { TEXT_ROW_LINE_HEIGHT, type ChatOutlinePrompt } from "./model";

export interface PromptDetailContentProps {
  prompt: ChatOutlinePrompt;
  index: number;
  total: number;
  onRequestPromptText: (seq: number) => Promise<string | null>;
  onJumpToPrompt: (seq: number) => void;
  onClose: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  actionsStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The full prompt text and its actions, shared by the desktop popover and compact sheet. */
export function PromptDetailContent({
  prompt,
  index,
  total,
  onRequestPromptText,
  onJumpToPrompt,
  onClose,
  style,
  contentStyle,
  actionsStyle,
  testID,
}: PromptDetailContentProps): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const textEpoch = useRef(0);
  // The reader is a fresh closure on most renders — it closes over the loaded timeline. Holding
  // it in a ref keeps the read tied to the prompt being shown instead of restarting it, which
  // repainted "Loading…" every time the chat re-rendered.
  const requestPromptTextRef = useRef(onRequestPromptText);
  useEffect(() => {
    requestPromptTextRef.current = onRequestPromptText;
  }, [onRequestPromptText]);

  useEffect(() => {
    const request = textEpoch;
    const epoch = ++request.current;
    setIsLoading(true);
    setFullText(null);
    void requestPromptTextRef.current(prompt.seq).then((text) => {
      if (request.current === epoch) {
        setFullText(text);
        setIsLoading(false);
      }
      return null;
    });
    return () => {
      request.current++;
    };
  }, [prompt.seq]);

  const handleJump = useCallback(() => {
    onJumpToPrompt(prompt.seq);
    onClose();
  }, [onClose, onJumpToPrompt, prompt.seq]);

  // Copy the loaded text, falling back to the index preview while the daemon read is in flight.
  const handleCopy = useCallback(async () => {
    const text = fullText ?? prompt.preview;
    if (!text) return;
    try {
      await copyToClipboard(text);
      toast.copied();
    } catch {
      toast.error(t("common.errors.unableToCopy"));
    }
  }, [fullText, prompt.preview, t, toast]);

  return (
    <View
      style={[styles.content, style]}
      role="dialog"
      accessibilityLabel={`${index + 1} of ${total}: ${prompt.preview}`}
      testID={testID ?? `chat-outline-prompt-detail-${prompt.seq}`}
    >
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, contentStyle]}
        showsVerticalScrollIndicator
        testID={`chat-outline-prompt-detail-scroll-${prompt.seq}`}
      >
        <Text style={styles.bodyText}>
          {isLoading ? t("common.loading") : (fullText ?? prompt.preview)}
        </Text>
      </ScrollView>
      <View
        style={[styles.actions, actionsStyle]}
        testID={`chat-outline-prompt-detail-actions-${prompt.seq}`}
      >
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
  content: {
    flexShrink: 0,
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
