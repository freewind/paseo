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
    metaKey?: boolean;
    ctrlKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
  }
>;

export interface AssistantCommentRequest {
  id: number;
  blockText: string;
}

/**
 * Both entry points on the selection menu open the same sheet: `comment` attaches the quote plus
 * what you type to the composer, `memo` stores the same text as a memo instead of sending it.
 */
export type AssistantAnnotationVariant = "comment" | "memo";

interface AssistantAnnotationSheetProps {
  variant: AssistantAnnotationVariant;
  request: AssistantCommentRequest | null;
  onCancel: () => void;
  /** Where the typed text lands. The quote itself is added by the caller. */
  onSubmit: (text: string) => void;
  /** Comment only: attach and send in one go. */
  onSendNow?: (text: string) => void;
}

const SNAP_POINTS = ["55%", "85%"];

/**
 * Desktop only: Enter attaches (or saves the memo) and Shift+Enter keeps the newline, matching the
 * footer buttons. Cmd/Ctrl+Enter sends the comment straight away — the send button's own action,
 * which only the comment variant has; without it the modifier changes nothing.
 *
 * Mobile soft keyboards have no Enter key, so they keep the buttons.
 */
function useEnterSubmit(onSubmit: () => void, onSendNow?: () => void) {
  return useCallback(
    (event: CommentSheetKeyPressEvent) => {
      if (isImeComposingKeyboardEvent(event.nativeEvent)) return;
      if (event.nativeEvent.key !== "Enter") return;
      if ((event.nativeEvent.metaKey || event.nativeEvent.ctrlKey) && onSendNow) {
        event.preventDefault();
        onSendNow();
        return;
      }
      if (event.nativeEvent.shiftKey) return;
      event.preventDefault();
      onSubmit();
    },
    [onSendNow, onSubmit],
  );
}

export function AssistantAnnotationSheet({
  variant,
  request,
  onCancel,
  onSubmit,
  onSendNow,
}: AssistantAnnotationSheetProps) {
  const isMemo = variant === "memo";
  const [retained, setRetained] = useState<AssistantCommentRequest | null>(request);
  const [text, setText] = useState("");

  useEffect(() => {
    if (request) {
      setRetained(request);
      setText("");
    }
  }, [request]);

  const close = useCallback(() => {
    setRetained(null);
    setText("");
    onCancel();
  }, [onCancel]);

  const trimmed = text.trim();
  // A memo can be the quote alone: saving a passage is the point. A comment with no words has
  // nothing to attach, so it stays disabled.
  const canSubmit = isMemo || trimmed.length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  }, [canSubmit, onSubmit, trimmed]);

  /** Same commit as submit, then the composer sends it instead of waiting for the user. */
  const handleSendNow = useCallback(() => {
    if (trimmed.length === 0) return;
    onSendNow?.(trimmed);
  }, [onSendNow, trimmed]);

  const handleKeyPress = useEnterSubmit(handleSubmit, isMemo ? undefined : handleSendNow);

  const { t } = useTranslation();
  const header = useMemo<SheetHeader>(
    () => ({ title: isMemo ? t("agentMemos.sheetTitle") : t("comment.sheet.title") }),
    [isMemo, t],
  );
  const placeholder = isMemo ? t("agentMemos.sheetPlaceholder") : t("comment.sheet.placeholder");

  const footer = useMemo(
    () =>
      retained ? (
        <View style={styles.actions}>
          <Button variant="ghost" onPress={close} testID={`assistant-${variant}-cancel`}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            disabled={!canSubmit}
            onPress={handleSubmit}
            testID={isMemo ? "assistant-memo-submit" : "assistant-comment-attach"}
          >
            {isMemo ? t("agentMemos.add") : t("comment.sheet.attach")}
          </Button>
          {isMemo ? null : (
            <Button
              variant="secondary"
              disabled={trimmed.length === 0}
              onPress={handleSendNow}
              testID="assistant-comment-send"
            >
              {t("comment.sheet.sendNow")}
            </Button>
          )}
        </View>
      ) : null,
    [canSubmit, close, handleSendNow, handleSubmit, isMemo, retained, t, trimmed, variant],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={request !== null}
      onClose={close}
      snapPoints={SNAP_POINTS}
      desktopMaxWidth={480}
      testID={`assistant-${variant}-sheet`}
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
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={styles.placeholderText.color}
            multiline
            autoFocus
            onKeyPress={isWeb ? handleKeyPress : undefined}
            testID={`assistant-${variant}-input`}
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
