import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Plus, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { EditingTextInput } from "@/components/ui/text-input";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const dangerIconMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const ThemedPlus = withUnistyles(Plus, mutedIconMapping);
const ThemedTrash2 = withUnistyles(Trash2, dangerIconMapping);

function createReplyId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface QuickRepliesEditorProps {
  visible: boolean;
  /** Remount key: bump it when the editor opens so items re-initialize from the saved list. */
  mountKey: string;
  replies: QuickReply[];
  onSave: (next: QuickReply[]) => void;
  onClose: () => void;
}

/**
 * Edits the quick replies list on one host's daemon config. The list state initializes on
 * mount, so reopening after a save always sees the latest saved list.
 */
export function QuickRepliesEditor({
  visible,
  mountKey,
  replies,
  onSave,
  onClose,
}: QuickRepliesEditorProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<QuickReply[]>(replies);
  const [newText, setNewText] = useState("");
  const [newReplyCounter, setNewReplyCounter] = useState(0);

  const addReply = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    setItems((current) => [...current, { id: createReplyId(), text }]);
    setNewText("");
    setNewReplyCounter((counter) => counter + 1);
  }, [newText]);

  const updateReply = useCallback((id: string, text: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, text } : item)));
  }, []);

  const removeReply = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const save = useCallback(() => {
    const cleaned = items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);
    onSave(cleaned);
  }, [items, onSave]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable
          style={styles.backdropPressable}
          onPress={onClose}
          accessibilityLabel={t("common.actions.close")}
        />
        <View style={styles.card} key={`${mountKey}:${newReplyCounter}`}>
          <Text style={styles.title}>{t("composer.quickReplies.editTitle")}</Text>
          <View style={styles.list}>
            {items.map((item) => (
              <QuickReplyEditorRow
                key={item.id}
                item={item}
                onChangeText={updateReply}
                onRemove={removeReply}
              />
            ))}
          </View>
          <View style={styles.addRow}>
            <EditingTextInput
              initialValue={newText}
              onChangeText={setNewText}
              placeholder={t("composer.quickReplies.placeholder")}
              style={styles.input}
              multiline
              testID="quick-replies-editor-new"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("composer.quickReplies.add")}
              testID="quick-replies-editor-add"
              onPress={addReply}
              style={styles.iconButton}
            >
              <ThemedPlus size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            testID="quick-replies-editor-save"
            onPress={save}
            style={styles.saveButton}
          >
            <Text style={styles.saveText}>{t("composer.quickReplies.save")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function QuickReplyEditorRow({
  item,
  onChangeText,
  onRemove,
}: {
  item: QuickReply;
  onChangeText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const handleChange = useCallback(
    (text: string) => onChangeText(item.id!, text),
    [item.id, onChangeText],
  );
  const handleRemove = useCallback(() => onRemove(item.id!), [item.id, onRemove]);
  return (
    <View style={styles.row}>
      <EditingTextInput
        initialValue={item.text}
        onChangeText={handleChange}
        style={styles.input}
        multiline
        testID={`quick-replies-editor-input-${item.id}`}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("composer.quickReplies.delete")}
        testID={`quick-replies-editor-delete-${item.id}`}
        onPress={handleRemove}
        style={styles.iconButton}
      >
        <ThemedTrash2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  list: {
    gap: theme.spacing[2],
    maxHeight: 320,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  addRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    minHeight: 40,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.base,
    textAlignVertical: "top",
  },
  iconButton: {
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  saveButton: {
    alignSelf: "flex-end",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  saveText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
}));
