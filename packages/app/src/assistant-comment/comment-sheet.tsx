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

/** react-native-web 的 onKeyPress 背后是 DOM 事件，带这些额外字段。 */
type CommentSheetKeyPressEvent = NativeSyntheticEvent<
  TextInputKeyPressEventData & {
    shiftKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
  }
>;

export interface CommentRequest {
  id: number;
  blockText: string;
}

interface CommentSheetProps {
  /** comment 附加到输入框；memo 直接存成备忘。 */
  variant?: "comment" | "memo";
  request: CommentRequest | null;
  onCancel: () => void;
  /** 附加到输入框；引文由调用方拼进去。 */
  onSubmit: (text: string) => void;
  /** 附加并立刻发送。 */
  onSendNow?: (text: string) => void;
}

const SNAP_POINTS = ["55%", "85%"];

/**
 * 桌面端：回车附加、Shift+回车换行，与底部按钮一致；Cmd/Ctrl+回车直接发送。
 * 手机软键盘没有回车键，继续用按钮。
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

export function CommentSheet({
  variant = "comment",
  request,
  onCancel,
  onSubmit,
  onSendNow,
}: CommentSheetProps) {
  const isMemo = variant === "memo";
  const [retained, setRetained] = useState<CommentRequest | null>(request);
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
  // 备忘可以只保存引文；评论没有正文就没有可附加的内容。
  const canSubmit = isMemo || trimmed.length > 0;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  }, [canSubmit, onSubmit, trimmed]);

  /** 与附加同一次提交，只是让 composer 接着发送。 */
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
          <Button variant="ghost" onPress={close} testID="assistant-comment-cancel">
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            disabled={!canSubmit}
            onPress={handleSubmit}
            testID={isMemo ? "assistant-memo-submit" : "assistant-comment-attach"}
          >
            {isMemo ? t("common.actions.add") : t("comment.sheet.attach")}
          </Button>
          {isMemo ? null : (
            <Button
              variant="secondary"
              disabled={!canSubmit}
              onPress={handleSendNow}
              testID="assistant-comment-send"
            >
              {t("comment.sheet.sendNow")}
            </Button>
          )}
        </View>
      ) : null,
    [canSubmit, close, handleSendNow, handleSubmit, isMemo, retained, t],
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
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
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
