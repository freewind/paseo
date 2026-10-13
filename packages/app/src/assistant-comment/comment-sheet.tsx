import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { SheetAwareTextInput } from "@/components/ui/text-input/sheet-aware";
import { isWeb } from "@/constants/platform";
import { isImeComposingKeyboardEvent } from "@/utils/keyboard-ime";

/** Web-only extras present on the DOM KeyboardEvent behind react-native-web's onKeyPress. */
type CommentSheetKeyPressEvent = NativeSyntheticEvent<
  TextInputKeyPressEventData & {
    shiftKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
  }
>;

export interface AssistantCommentRequest {
  id: number;
  blockText: string;
}

interface AssistantCommentSheetProps {
  request: AssistantCommentRequest | null;
  onCancel: () => void;
  onAttach: (comment: string) => void;
}

const SNAP_POINTS = ["55%", "85%"];

export function AssistantCommentSheet({ request, onCancel, onAttach }: AssistantCommentSheetProps) {
  const [retained, setRetained] = useState<AssistantCommentRequest | null>(request);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (request) {
      setRetained(request);
      setComment("");
    }
  }, [request]);

  const close = useCallback(() => {
    setRetained(null);
    setComment("");
    onCancel();
  }, [onCancel]);

  const handleAttach = useCallback(() => {
    if (comment.trim().length > 0) {
      onAttach(comment);
    }
  }, [comment, onAttach]);

  // Desktop only: Enter attaches, Shift+Enter keeps the newline. Mobile soft
  // keyboards have no Enter key, so they keep the attach button.
  const handleKeyPress = useCallback(
    (event: CommentSheetKeyPressEvent) => {
      if (isImeComposingKeyboardEvent(event.nativeEvent)) return;
      if (event.nativeEvent.key !== "Enter") return;
      if (event.nativeEvent.shiftKey) return;
      event.preventDefault();
      handleAttach();
    },
    [handleAttach],
  );

  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(() => ({ title: t("comment.sheet.title") }), [t]);
  const footer = useMemo(
    () =>
      retained ? (
        <View style={styles.actions}>
          <Button variant="ghost" onPress={close} testID="assistant-comment-cancel">
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            disabled={comment.trim().length === 0}
            onPress={handleAttach}
            testID="assistant-comment-attach"
          >
            {t("comment.sheet.attach")}
          </Button>
        </View>
      ) : null,
    [close, comment, handleAttach, retained, t],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={request !== null}
      onClose={close}
      snapPoints={SNAP_POINTS}
      desktopMaxWidth={480}
      testID="assistant-comment-sheet"
      footer={footer}
    >
      {retained ? (
        <View style={styles.container}>
          <View style={styles.quote}>
            <Text style={styles.quoteLabel} numberOfLines={1}>
              {t("comment.sheet.quote")}
            </Text>
            <Text style={styles.quoteText} numberOfLines={4}>
              {retained.blockText}
            </Text>
          </View>
          <SheetAwareTextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder={t("comment.sheet.placeholder")}
            placeholderTextColor={styles.placeholderText.color}
            multiline
            autoFocus
            onKeyPress={isWeb ? handleKeyPress : undefined}
            testID="assistant-comment-input"
          />
        </View>
      ) : null}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    gap: theme.spacing[3],
  },
  quote: {
    gap: theme.spacing[1],
    borderLeftWidth: theme.borderWidth[2],
    borderLeftColor: theme.colors.border,
    paddingLeft: theme.spacing[3],
  },
  quoteLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  quoteText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  input: {
    minHeight: 96,
    maxHeight: 200,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  placeholderText: {
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
