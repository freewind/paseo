import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  IsolatedBottomSheetModal,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import { SheetAwareTextInput } from "@/components/ui/text-input/sheet-aware";

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

const CommentSheetModal = withUnistyles(IsolatedBottomSheetModal, (theme) => ({
  backgroundStyle: {
    backgroundColor: theme.colors.surface2,
    borderRadius: 16,
  },
  handleIndicatorStyle: {
    backgroundColor: theme.colors.palette.zinc[600],
  },
}));

export function AssistantCommentSheet({ request, onCancel, onAttach }: AssistantCommentSheetProps) {
  const [retained, setRetained] = useState<AssistantCommentRequest | null>(request);

  useEffect(() => {
    if (request) {
      setRetained(request);
    }
  }, [request]);

  const close = useCallback(() => {
    setRetained(null);
    onCancel();
  }, [onCancel]);

  const { sheetRef, handleSheetChange, handleSheetDismiss } = useIsolatedBottomSheetVisibility({
    visible: request !== null,
    onClose: close,
  });

  return (
    <CommentSheetModal
      ref={sheetRef}
      contextBridge={null}
      snapPoints={SNAP_POINTS}
      index={0}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      onChange={handleSheetChange}
      onDismiss={handleSheetDismiss}
      backdropOpacity={0.5}
      enablePanDownToClose
    >
      {retained ? (
        <CommentSheetContent
          key={retained.id}
          blockText={retained.blockText}
          onCancel={close}
          onAttach={onAttach}
        />
      ) : null}
    </CommentSheetModal>
  );
}

interface CommentSheetContentProps {
  blockText: string;
  onCancel: () => void;
  onAttach: (comment: string) => void;
}

function CommentSheetContent({ blockText, onCancel, onAttach }: CommentSheetContentProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  const canAttach = comment.trim().length > 0;

  const handleAttach = useCallback(() => {
    if (comment.trim().length === 0) {
      return;
    }
    onAttach(comment);
  }, [comment, onAttach]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("comment.sheet.title")}</Text>
      <View style={styles.quote}>
        <Text style={styles.quoteLabel} numberOfLines={1}>
          {t("comment.sheet.quote")}
        </Text>
        <Text style={styles.quoteText} numberOfLines={4}>
          {blockText}
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
        testID="assistant-comment-input"
      />
      <View style={styles.actions}>
        <Button variant="ghost" onPress={onCancel} testID="assistant-comment-cancel">
          {t("common.actions.cancel")}
        </Button>
        <Button
          variant="default"
          disabled={!canAttach}
          onPress={handleAttach}
          testID="assistant-comment-attach"
        >
          {t("comment.sheet.attach")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
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
