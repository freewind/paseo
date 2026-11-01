import { useCallback, useMemo, useState, type Ref } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GripVertical, Plus, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { QuickReply } from "@getpaseo/protocol/messages";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { PressHighlight } from "@/components/ui/press-highlight";
import { EditingTextInput } from "@/components/ui/text-input";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedGripVertical = withUnistyles(GripVertical, mutedIconMapping);

/** 本地生成即可：id 只用来给拖拽排序和行内编辑做身份，不需要跨端协商。 */
function createReplyId(): string {
  return `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function replyKeyExtractor(item: QuickReply): string {
  return item.id;
}

interface QuickRepliesEditorProps {
  visible: boolean;
  /** 每次打开换一个 key，让本地列表重新从已保存的那份初始化。 */
  mountKey: string;
  replies: QuickReply[];
  onSave: (next: QuickReply[]) => void;
  onClose: () => void;
}

/**
 * 编辑当前主机 daemon 配置里的常用回复。列表顺序就是拖出来的顺序，保存时整份写回；
 * 新增行只在新加时挂载，避免一堆空行占着弹层。
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

  const header = useMemo(() => ({ title: t("composer.quickReplies.editTitle") }), [t]);
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="ghost" size="sm" onPress={onClose}>
          {t("common.actions.cancel")}
        </Button>
        <Button size="sm" onPress={save} disabled={isAdding} testID="quick-replies-editor-save">
          {t("common.actions.save")}
        </Button>
      </View>
    ),
    [isAdding, onClose, save, t],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      footer={footer}
      desktopHeight="85%"
      scrollable={false}
      testID="quick-replies-editor"
    >
      <View style={styles.card} key={mountKey}>
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
          <Button
            variant="secondary"
            size="sm"
            leftIcon={Plus}
            onPress={startAdding}
            testID="quick-replies-editor-add"
            style={styles.addButton}
          >
            {t("composer.quickReplies.add")}
          </Button>
        )}
      </View>
    </AdaptiveModalSheet>
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
        testID={`quick-replies-editor-input-${item.id}`}
      />
      <Button
        variant="ghost"
        size="xs"
        leftIcon={Trash2}
        accessibilityLabel={t("composer.quickReplies.delete")}
        onPress={handleRemove}
        testID={`quick-replies-editor-delete-${item.id}`}
      />
    </View>
  );
}

/** web 从 dnd-kit 的 activator 起拖；原生用列表的 `drag()`，由激活距离决定真正抬起。 */
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
    <PressHighlight
      {...listeners}
      ref={setActivatorNodeRef as unknown as Ref<View>}
      accessible={false}
      style={styles.dragHandle}
      highlightStyle={styles.dragHandleHighlight}
      testID="quick-replies-editor-drag-handle"
      onPressIn={handlePressIn}
    >
      <ThemedGripVertical size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
    </PressHighlight>
  );
}

/** 单行输入：回车即提交；空内容失焦直接收起，有内容则保留给确认按钮。 */
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
      <Button
        variant="ghost"
        size="xs"
        leftIcon={Plus}
        accessibilityLabel={t("composer.quickReplies.add")}
        onPress={handleSubmit}
        testID="quick-replies-editor-new-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  card: {
    flex: 1,
    minHeight: 0,
    gap: theme.spacing[3],
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    flex: 1,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: theme.spacing[2],
  },
  addButton: {
    alignSelf: "flex-start",
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
  },
  dragHandle: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  dragHandleHighlight: {
    backgroundColor: theme.colors.surface2,
  },
}));
