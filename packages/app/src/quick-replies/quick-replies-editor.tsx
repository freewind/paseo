import { useCallback, useState, type Ref } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { EditingTextInput } from "@/components/ui/text-input";
import { isNative } from "@/constants/platform";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const dangerIconMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const ThemedPlus = withUnistyles(Plus, mutedIconMapping);
const ThemedTrash2 = withUnistyles(Trash2, dangerIconMapping);
const ThemedGripVertical = withUnistyles(GripVertical, mutedIconMapping);
const ThemedCheck = withUnistyles(Check, mutedIconMapping);

/** Android modals are separate windows, so drag gestures need their own gesture root. */
const ModalRoot = isNative ? GestureHandlerRootView : View;

function createReplyId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function replyKeyExtractor(item: QuickReply): string {
  return item.id;
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
 * mount, so reopening after a save always sees the latest saved list. Rows are reordered by
 * dragging their handle, and the new-reply input only exists while the user is adding one.
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
  const [isAdding, setIsAdding] = useState(false);

  const startAdding = useCallback(() => setIsAdding(true), []);
  const cancelAdding = useCallback(() => setIsAdding(false), []);
  const commitNewReply = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      setItems((current) => [...current, { id: createReplyId(), text: trimmed }]);
    }
    setIsAdding(false);
  }, []);

  const updateReply = useCallback((id: string, text: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, text } : item)));
  }, []);

  const removeReply = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const handleDragEnd = useCallback((next: QuickReply[]) => {
    setItems(next);
  }, []);

  const renderItem = useCallback(
    ({ item, drag, isActive, dragHandleProps }: DraggableRenderItemInfo<QuickReply>) => (
      <QuickReplyEditorRow
        item={item}
        isDragging={isActive}
        drag={drag}
        dragHandleProps={dragHandleProps}
        onChangeText={updateReply}
        onRemove={removeReply}
      />
    ),
    [updateReply, removeReply],
  );

  const save = useCallback(() => {
    const cleaned = items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);
    onSave(cleaned);
  }, [items, onSave]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalRoot style={styles.modalRoot}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.backdrop}
        >
          <Pressable
            style={styles.backdropPressable}
            onPress={onClose}
            accessibilityLabel={t("common.actions.close")}
          />
          <View style={styles.card} key={mountKey}>
            <Text style={styles.title}>{t("composer.quickReplies.editTitle")}</Text>
            <DraggableList
              testID="quick-replies-editor-list"
              data={items}
              keyExtractor={replyKeyExtractor}
              renderItem={renderItem}
              onDragEnd={handleDragEnd}
              useDragHandle
              containerStyle={styles.list}
              contentContainerStyle={styles.listContent}
            />
            {isAdding ? (
              <NewReplyRow onCommit={commitNewReply} onCancel={cancelAdding} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("composer.quickReplies.add")}
                testID="quick-replies-editor-add"
                onPress={startAdding}
                style={styles.addButton}
              >
                <ThemedPlus size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
                <Text style={styles.addText}>{t("composer.quickReplies.add")}</Text>
              </Pressable>
            )}
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
      </ModalRoot>
    </Modal>
  );
}

function QuickReplyEditorRow({
  item,
  isDragging,
  drag,
  dragHandleProps,
  onChangeText,
  onRemove,
}: {
  item: QuickReply;
  isDragging: boolean;
  drag: () => void;
  dragHandleProps?: DraggableListDragHandleProps;
  onChangeText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const handleChange = useCallback(
    (text: string) => onChangeText(item.id, text),
    [item.id, onChangeText],
  );
  const handleRemove = useCallback(() => onRemove(item.id), [item.id, onRemove]);
  return (
    <View style={styles.row}>
      <QuickReplyDragHandle drag={drag} isDragging={isDragging} dragHandleProps={dragHandleProps} />
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

/**
 * The row's drag affordance. Web starts the drag from dnd-kit's activator listeners; native
 * starts it from the list's `drag()` callback on press-in, and the list's activation distance
 * decides when the row actually lifts.
 */
function QuickReplyDragHandle({
  drag,
  isDragging,
  dragHandleProps,
}: {
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
}) {
  const listeners = dragHandleProps?.listeners;
  const setActivatorNodeRef = dragHandleProps?.setActivatorNodeRef;
  const handlePressIn = useCallback(() => {
    if (!isDragging) {
      drag();
    }
  }, [drag, isDragging]);
  return (
    <Pressable
      {...listeners}
      ref={setActivatorNodeRef as unknown as Ref<View>}
      accessible={false}
      style={styles.dragHandle}
      testID="quick-replies-editor-drag-handle"
      onPressIn={handlePressIn}
    >
      <ThemedGripVertical size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
    </Pressable>
  );
}

/**
 * The add row, mounted only while adding. A single-line input so Enter submits on both web and
 * native (multiline inputs treat Enter as a newline); the check button commits too. Blurring an
 * empty field dismisses the row, while blur with text present leaves it mounted so the check
 * press still lands.
 */
function NewReplyRow({
  onCommit,
  onCancel,
}: {
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const handleSubmit = useCallback(() => onCommit(text), [onCommit, text]);
  const handleBlur = useCallback(() => {
    if (!text.trim()) {
      onCancel();
    }
  }, [onCancel, text]);
  return (
    <View style={styles.row}>
      <EditingTextInput
        initialValue=""
        onChangeText={setText}
        placeholder={t("composer.quickReplies.placeholder")}
        style={styles.input}
        autoFocus
        onSubmitEditing={handleSubmit}
        onBlur={handleBlur}
        testID="quick-replies-editor-new"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("composer.quickReplies.add")}
        testID="quick-replies-editor-new-confirm"
        onPress={handleSubmit}
        style={styles.iconButton}
      >
        <ThemedCheck size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  modalRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
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
  /**
   * The list keeps the card's height budget: it grows with its rows up to the cap and scrolls
   * past it. `flexBasis: "auto"` cancels the flex-basis the web wrapper applies when scrolling.
   */
  list: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: "auto",
    maxHeight: 320,
  },
  listContent: {
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    minHeight: 32,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    fontSize: theme.fontSize.base,
    textAlignVertical: "top",
  },
  dragHandle: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  addText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
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
