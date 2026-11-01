import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CheckCircle2, Circle, ClipboardList, ListPlus, Plus, Trash2 } from "lucide-react-native";
import type { AgentMemo, ImageAttachment } from "@getpaseo/protocol/messages";
import { AttachmentLightbox, type ImageLightboxSource } from "@/components/attachment-lightbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { PressHighlight } from "@/components/ui/press-highlight";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { Button } from "@/components/ui/button";
import { EditingTextInput } from "@/components/ui/text-input";
import { encodeAttachmentsForSend } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { AgentMemoComposer } from "./agent-memo-composer";
import { useAgentMemos } from "./use-agent-memos";
import { useHostFeature } from "@/runtime/host-features";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const completedIconMapping = (theme: Theme) => ({ color: theme.colors.accent });
const ThemedClipboardList = withUnistyles(ClipboardList, mutedIconMapping);
const ThemedAddPlus = withUnistyles(Plus, mutedIconMapping);
const ThemedListPlus = withUnistyles(ListPlus, mutedIconMapping);
/** 批量输入多行；placeholder 颜色是 prop，同样走主题。 */
const BulkTextInput = withUnistyles(EditingTextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));
const ThemedTrash2 = withUnistyles(Trash2, mutedIconMapping);
const ThemedCircle = withUnistyles(Circle, mutedIconMapping);
const ThemedCheckCircle2 = withUnistyles(CheckCircle2, completedIconMapping);
/** 小到能内联，带图片的备忘仍只占一行。 */
const MEMO_IMAGE_SIZE = 24;
/** 右栏可读长度：再长就不再好扫读，还会吃掉整栏空间。 */
const MEMO_TEXT_MAX_CHARS = 80;

/** 按字符而不是 UTF-16 单元计数，emoji 不会被截成半个。 */
function ellipsizeMemoText(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= MEMO_TEXT_MAX_CHARS) {
    return text;
  }
  return `${characters.slice(0, MEMO_TEXT_MAX_CHARS).join("")}…`;
}

/**
 * 把 agent 的备忘当常驻待办清单：宽布局在窗格右栏，紧凑布局在 sheet 里。
 * sheet 自己的头部已有标题，那里 rail 不再重复。

 *
 * 未完成的备忘在前，完成的沉到底部（划掉、变淡），两组各自保持 daemon 的创建顺序。
 * 点文字把备忘追加到输入框但保留备忘本身；右键菜单可直接发送，勾选框切换完成，
 * 垃圾桶先问再删。完成状态存在 daemon 上，所以每个客户端看到的一致。





 */
export const AgentMemosRail = memo(function AgentMemosRail({
  serverId,
  agentId,
  compact = false,
  showTitle = true,
  onAppendToComposer,
}: {
  serverId: string;
  agentId: string;
  /** 紧凑宿主把列表放进 sheet 而不是输入框旁；头部保持一致。 */
  compact?: boolean;
  /** sheet 头部已有标题，rail 去掉自己的标题，只留添加按钮。 */
  showTitle?: boolean;
  /** 把备忘（文字与图片）追加到输入框，不发送。 */
  onAppendToComposer: (memo: AgentMemo) => void;
}) {
  const { t } = useTranslation();
  const supported = useHostFeature(serverId, "agentMemos");
  const supportsCompletion = useHostFeature(serverId, "agentMemoCompletion");
  const supportsImages = useHostFeature(serverId, "agentMemoImages");
  const { memos, addMemo, updateMemo, setMemoCompleted, deleteMemo, clearMemos } = useAgentMemos({
    serverId,
    agentId,
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkKey, setBulkKey] = useState(0);
  const bulkDraft = useRef("");
  const bulk = useMemo(
    () => ({
      open: t("freewind.bulk.open"),
      placeholder: t("freewind.bulk.placeholder"),
      submit: t("freewind.bulk.submit"),
    }),
    [t],
  );
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [lightboxSource, setLightboxSource] = useState<ImageLightboxSource | null>(null);

  const orderedMemos = useMemo(() => orderMemos(memos), [memos]);

  const handleStartAdding = useCallback(() => {
    setEditingMemoId(null);
    setIsAdding(true);
  }, []);
  const handleClearMemos = useCallback(() => {
    void clearMemos().catch(() => undefined);
  }, [clearMemos]);
  const handleCancelAdd = useCallback(() => setIsAdding(false), []);
  const handleOpenBulk = useCallback(() => {
    setEditingMemoId(null);
    setIsAdding(false);
    bulkDraft.current = "";
    setBulkKey((key) => key + 1);
    setIsBulkOpen(true);
  }, []);
  const handleCancelBulk = useCallback(() => setIsBulkOpen(false), []);
  // 每个非空行一条备忘，按输入顺序添加，列表就保持用户写下的顺序。
  const handleBulkSubmit = useCallback(async () => {
    const lines = bulkDraft.current
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return;
    for (const line of lines) {
      await addMemo(line, []);
    }
    bulkDraft.current = "";
    setIsBulkOpen(false);
  }, [addMemo]);
  const handleBulkChange = useCallback((text: string) => {
    bulkDraft.current = text;
  }, []);
  const handleBulkSubmitPress = useCallback(() => {
    void handleBulkSubmit();
  }, [handleBulkSubmit]);
  const handleStartEdit = useCallback((memoId: string) => {
    setIsAdding(false);
    setEditingMemoId(memoId);
  }, []);
  const handleCancelEdit = useCallback(() => setEditingMemoId(null), []);
  const handleCloseLightbox = useCallback(() => setLightboxSource(null), []);
  const handleOpenMemoImage = useCallback(
    (image: ImageAttachment) => setLightboxSource({ type: "uri", uri: memoImageUri(image) }),
    [],
  );
  const handleAddMemo = useCallback(
    async (text: string, images: readonly AttachmentMetadata[]) => {
      const encoded = await encodeAttachmentsForSend(images);
      await addMemo(text, encoded);
      setIsAdding(false);
    },
    [addMemo],
  );
  const handleMemoCompletedChange = useCallback(
    (memoId: string, completed: boolean) =>
      void setMemoCompleted(memoId, completed).catch(() => undefined),
    [setMemoCompleted],
  );
  const handleUpdateMemo = useCallback(
    async (
      entry: AgentMemo,
      text: string,
      images: readonly AttachmentMetadata[],
      keptImages: readonly ImageAttachment[],
    ) => {
      const encoded = await encodeAttachmentsForSend(images);
      const nextImages = [...keptImages, ...(encoded ?? [])];
      const initialImages = entry.images ?? [];
      const imagesChanged =
        nextImages.length !== initialImages.length ||
        nextImages.some((image, index) => image.data !== initialImages[index]?.data);
      // 省略 `images` 保持原图；显式数组整份替换，空数组就是删掉最后一张。

      await updateMemo(entry.id, text, imagesChanged ? nextImages : undefined);
      setEditingMemoId(null);
    },
    [updateMemo],
  );

  // 点文字只追加，备忘要等垃圾桶按钮才删除。
  const handleMemoPress = useCallback(
    (entry: AgentMemo) => {
      onAppendToComposer(entry);
    },
    [onAppendToComposer],
  );

  // 删除无法从列表里撤销，所以行内先问一次。
  const handleRequestDelete = useCallback(
    (entry: AgentMemo) => {
      void deleteMemo(entry.id).catch(() => undefined);
    },
    [deleteMemo],
  );

  if (!supported) {
    return null;
  }

  return (
    <View
      style={[styles.container, compact ? styles.containerCompact : styles.containerGutter]}
      testID="agent-memos-rail"
    >
      <View style={[styles.header, showTitle ? null : styles.headerTrailing]}>
        {showTitle ? (
          <View style={styles.titleGroup}>
            <ThemedClipboardList size={ICON_SIZE.md} uniProps={mutedIconMapping} />
            <Text style={styles.title} numberOfLines={1}>
              {t("agentMemos.toggle")}
            </Text>
          </View>
        ) : null}
        <View style={styles.headerActions}>
          <ToolbarButton label={bulk.open} onPress={handleOpenBulk} testID="agent-memo-bulk-add">
            <ThemedListPlus size={ICON_SIZE.md} uniProps={mutedIconMapping} />
          </ToolbarButton>
          <ToolbarButton
            label={t("common.actions.add")}
            onPress={handleStartAdding}
            testID="agent-memo-add"
          >
            <ThemedAddPlus size={ICON_SIZE.md} uniProps={mutedIconMapping} />
          </ToolbarButton>
        </View>
      </View>
      <View style={styles.list}>
        {isBulkOpen ? (
          <View style={styles.bulk}>
            <BulkTextInput
              key={bulkKey}
              multiline
              initialValue=""
              onChangeText={handleBulkChange}
              placeholder={bulk.placeholder}
              style={styles.bulkInput}
              testID="agent-memo-bulk-input"
            />
            <View style={styles.bulkActions}>
              <Button variant="ghost" size="sm" onPress={handleCancelBulk}>
                {t("common.actions.cancel")}
              </Button>
              <Button variant="default" size="sm" onPress={handleBulkSubmitPress}>
                {bulk.submit}
              </Button>
            </View>
          </View>
        ) : null}
        {orderedMemos.map((entry) =>
          entry.id === editingMemoId ? (
            <AgentMemoEditor
              key={entry.id}
              entry={entry}
              submitLabel={t("common.actions.save")}
              onSubmit={handleUpdateMemo}
              onCancel={handleCancelEdit}
              canAttachImages={supportsImages}
            />
          ) : (
            <AgentMemoRow
              key={entry.id}
              entry={entry}
              supportsCompletion={supportsCompletion}
              onUse={handleMemoPress}
              onCompletedChange={handleMemoCompletedChange}
              onRequestDelete={handleRequestDelete}
              onRequestEdit={handleStartEdit}
              onOpenImage={handleOpenMemoImage}
            />
          ),
        )}
        {isAdding ? (
          <AgentMemoComposer
            onSubmit={handleAddMemo}
            onCancel={handleCancelAdd}
            canAttachImages={supportsImages}
          />
        ) : null}
        {orderedMemos.length > 0 ? (
          <View style={styles.clearFooter}>
            <MemoClearButton label={t("common.actions.clear")} onClear={handleClearMemos} />
          </View>
        ) : null}
      </View>
      <AttachmentLightbox source={lightboxSource} onClose={handleCloseLightbox} />
    </View>
  );
});

/**
 * 列表的清空按钮：行内垃圾桶图标，先原地确认，放在列表末尾，
 * 让破坏性动作跟着它清空的行一起走。tooltip 挂在外层 View 上，
 * 因为 InlineConfirm 是函数组件，拿不到 tooltip 需要的 ref；外层尺寸与触发点一致，
 * 悬停落在哪一层都能命中。
 */
const MemoClearButton = memo(function MemoClearButton({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <View style={styles.clearButtonHost} collapsable={false}>
          <InlineConfirm
            triggerStyle={styles.clearButton}
            onConfirm={onClear}
            destructive
            testID="agent-memo-clear"
          >
            <ThemedTrash2 size={ICON_SIZE.lg} uniProps={mutedIconMapping} />
          </InlineConfirm>
        </View>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * 正在编辑的一条备忘。在这里绑定 entry，让 composer 的提交回调保持稳定，
 * 行映射里不必每次渲染新建闭包。
 */
const AgentMemoEditor = memo(function AgentMemoEditor({
  entry,
  submitLabel,
  onSubmit,
  onCancel,
  canAttachImages,
}: {
  entry: AgentMemo;
  submitLabel: string;
  onSubmit: (
    entry: AgentMemo,
    text: string,
    images: readonly AttachmentMetadata[],
    keptImages: readonly ImageAttachment[],
  ) => Promise<void>;
  onCancel: () => void;
  canAttachImages: boolean;
}) {
  const handleSubmit = useCallback(
    (text: string, images: readonly AttachmentMetadata[], keptImages: readonly ImageAttachment[]) =>
      onSubmit(entry, text, images, keptImages),
    [entry, onSubmit],
  );
  return (
    <AgentMemoComposer
      initialText={entry.text}
      initialImages={entry.images}
      submitLabel={submitLabel}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      canAttachImages={canAttachImages}
    />
  );
});

/**
 * 未完成在前、完成的沉底；两组各自保持 daemon 的创建顺序，
 * 所以编辑不会换位，勾选只把它移进完成组。

 */
function orderMemos(memos: readonly AgentMemo[]): AgentMemo[] {
  return [...memos].sort((a, b) => {
    const completionDelta = Number(a.completed === true) - Number(b.completed === true);
    if (completionDelta !== 0) {
      return completionDelta;
    }
    return memoCreationTime(a) - memoCreationTime(b);
  });
}

function memoCreationTime(entry: AgentMemo): number {
  const parsed = Date.parse(entry.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function AgentMemoRow({
  entry,
  supportsCompletion,
  onUse,
  onCompletedChange,
  onRequestDelete,
  onRequestEdit,
  onOpenImage,
}: {
  entry: AgentMemo;
  supportsCompletion: boolean;
  onUse: (memo: AgentMemo) => void;
  onCompletedChange: (memoId: string, completed: boolean) => void;
  onRequestDelete: (entry: AgentMemo) => void;
  onRequestEdit: (memoId: string) => void;
  onOpenImage: (image: ImageAttachment) => void;
}) {
  const { t } = useTranslation();
  const isCompleted = entry.completed === true;
  const handleUse = useCallback(() => onUse(entry), [entry, onUse]);
  const handleToggleCompleted = useCallback(
    () => onCompletedChange(entry.id, !isCompleted),
    [entry.id, isCompleted, onCompletedChange],
  );
  const handleDelete = useCallback(() => onRequestDelete(entry), [entry, onRequestDelete]);
  const handleEdit = useCallback(() => onRequestEdit(entry.id), [entry.id, onRequestEdit]);
  const accessibilityState = useMemo(() => ({ checked: isCompleted }), [isCompleted]);
  const memoImageEntries = useMemo(
    () =>
      (entry.images ?? []).map((image, index) => ({
        key: `${entry.id}:image:${index}`,
        image,
      })),
    [entry.id, entry.images],
  );
  return (
    <View style={styles.row}>
      {supportsCompletion ? (
        <PressHighlight
          style={styles.checkButton}
          onPress={handleToggleCompleted}
          accessibilityRole="checkbox"
          accessibilityState={accessibilityState}
          accessibilityLabel={isCompleted ? t("agentMemos.markNotDone") : t("agentMemos.markDone")}
          testID={`agent-memo-toggle-${entry.id}`}
          highlightStyle={styles.checkHighlight}
          hitSlop={6}
        >
          {isCompleted ? <ThemedCheckCircle2 size={14} /> : <ThemedCircle size={14} />}
        </PressHighlight>
      ) : null}
      <View style={styles.rowBody}>
        <ContextMenu>
          <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild>
              {/* The tooltip needs a plain view to hover and measure. `ContextMenuTrigger`
                  would work too, except it renders `<PressHighlight {...props} ref={handleRef}>`
                  and that later `ref` drops the one the tooltip injects through `asChild`,
                  leaving its `triggerRef` null — which silently renders no tooltip at all. */}
              <View style={styles.memoButtonHost}>
                <AgentMemoTextButton
                  text={entry.text}
                  completed={isCompleted}
                  onPress={handleUse}
                  testID={`agent-memo-item-${entry.id}`}
                />
              </View>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" offset={6} maxWidth={420}>
              <Text style={styles.tooltipText}>{entry.text}</Text>
            </TooltipContent>
          </Tooltip>
          <ContextMenuContent align="start" width={200} testID={`agent-memo-menu-${entry.id}`}>
            <ContextMenuItem onSelect={handleUse}>{t("composer.input.send")}</ContextMenuItem>
            <ContextMenuItem onSelect={handleEdit}>{t("common.actions.edit")}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </View>
      {entry.images && entry.images.length > 0 ? (
        <View style={styles.memoImageRow}>
          {memoImageEntries.map(({ key, image }) => (
            <MemoImageThumb key={key} image={image} onOpen={onOpenImage} />
          ))}
        </View>
      ) : null}
      <InlineConfirm
        triggerStyle={styles.deleteButton}
        onConfirm={handleDelete}
        destructive
        testID={`agent-memo-delete-${entry.id}`}
      >
        <ThemedTrash2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
      </InlineConfirm>
    </View>
  );
}

/** 右栏里的备忘文字：点击追加到输入框，右键打开菜单，完整内容在 tooltip 里。 */
function AgentMemoTextButton({
  text,
  completed,
  onPress,
  testID,
}: {
  text: string;
  completed: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  return (
    <ContextMenuTrigger
      style={styles.memoButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t("agentMemos.useMemo")}
      testID={testID}
    >
      <Text style={completed ? styles.memoTextCompleted : styles.memoText}>
        {ellipsizeMemoText(text)}
      </Text>
    </ContextMenuTrigger>
  );
}

/** 存储形状就是内联 base64，所以备忘图片不需要解析 URL。 */
function memoImageUri(image: ImageAttachment): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

function MemoImageThumb({
  image,
  onOpen,
}: {
  image: ImageAttachment;
  onOpen: (image: ImageAttachment) => void;
}) {
  const { t } = useTranslation();
  const source = useMemo(() => ({ uri: memoImageUri(image) }), [image]);
  const handlePress = useCallback(() => onOpen(image), [image, onOpen]);
  return (
    <PressHighlight
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t("composer.attachments.openImage")}
      testID="agent-memo-image"
      highlightStyle={styles.checkHighlight}
    >
      <Image source={source} style={styles.memoImage} />
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    gap: theme.spacing[2],
    minWidth: 0,
  },
  /** 窗格右栏：从块自身顶部往下读。 */
  containerGutter: {
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  /** 输入框上方：列表占满输入列宽度。 */
  containerCompact: {
    alignItems: "stretch",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  /** 没有标题时添加按钮是头部唯一子元素，仍贴右。 */
  headerTrailing: {
    justifyContent: "flex-end",
  },
  /** 清空与添加并排贴在尾部。 */
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: theme.spacing[2],
  },
  title: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  list: {
    gap: theme.spacing[1],
    minWidth: 0,
  },
  // 清空按钮与各行的垃圾桶按钮共用同一条右侧基准线：按钮本身带内边距，
  // 所以 footer 只需要把它推到末尾。
  clearFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  memoImageRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing[1],
  },
  memoImage: {
    width: MEMO_IMAGE_SIZE,
    height: MEMO_IMAGE_SIZE,
    borderRadius: theme.borderRadius.sm,
    // 边框取背景反色，正好在图片与背景接近时显形：深色截图贴着深色表面仍看得出是图片。

    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.surface2,
  },
  memoButtonHost: {
    flex: 1,
    minWidth: 0,
  },
  memoButton: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  memoText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    // 备忘按文字换行，行高要保持可读：字号 1.4 倍，连续换行才不会糊成一块。

    lineHeight: Math.round(theme.fontSize.sm * 1.4),
  },
  memoTextCompleted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
    textDecorationLine: "line-through",
  },
  checkButton: {
    padding: theme.spacing[1],
    // 行内垂直居中；这个按钮保持自身尺寸，不被换行变高的文字挤压。

    flexShrink: 0,
  },
  checkHighlight: {
    backgroundColor: theme.colors.surface2,
  },
  deleteButton: {
    padding: theme.spacing[1],
    flexShrink: 0,
  },
  clearButton: {
    padding: theme.spacing[1],
  },
  /** tooltip 的 ref 宿主；触发点保留自己的内边距。 */
  clearButtonHost: {
    alignItems: "center",
    justifyContent: "center",
  },
  bulk: {
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  bulkInput: {
    minHeight: 88,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    textAlignVertical: "top",
  },
  bulkActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
