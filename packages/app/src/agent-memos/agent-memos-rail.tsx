import { memo, useCallback, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CheckCircle2, Circle, ClipboardList, Plus, Trash2 } from "lucide-react-native";
import type { AgentMemo, ImageAttachment } from "@getpaseo/protocol/messages";
import { AttachmentLightbox, type ImageLightboxSource } from "@/components/attachment-lightbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { iconButtonChromeStyle } from "@/components/ui/icon-button-chrome";
import { InlineConfirm } from "@/components/ui/inline-confirm";
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
const ThemedTrash2 = withUnistyles(Trash2, mutedIconMapping);
const ThemedCircle = withUnistyles(Circle, mutedIconMapping);
const ThemedCheckCircle2 = withUnistyles(CheckCircle2, completedIconMapping);
/** Small enough to sit inline, so a memo with images still occupies a single row. */
const MEMO_IMAGE_SIZE = 24;

/**
 * The agent's memos as a standing todo list: the composer's left gutter on a wide layout, and the
 * body of the compact sheet. The rail owns its header everywhere except inside that sheet, whose
 * header already carries the same title.
 *
 * Open memos come first and completed ones sink to the bottom, struck through and dimmed, each
 * group keeping the daemon's creation order. Every memo is one line, ellipsized at the tail, with
 * the full text in a hover tooltip. Pressing the text appends it to the composer and leaves the
 * memo in place; the context menu sends it, the checkbox toggles completion, and the trash button
 * asks before deleting. The header carries clear and add, matching the quick replies bar on the
 * opposite gutter: clearing the whole list asks in place first, like the row trash button does.
 * Completion lives on the daemon with the memo, so every client sees it.
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
  /** Compact hosts put the list in a sheet instead of beside the composer; the header is the same. */
  compact?: boolean;
  /** The sheet carries the title in its header, so the rail drops its own and keeps the add button. */
  showTitle?: boolean;
  /** Appends the memo (text + images) to the composer without sending. */
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
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [lightboxSource, setLightboxSource] = useState<ImageLightboxSource | null>(null);

  const orderedMemos = useMemo(() => orderMemos(memos), [memos]);

  const handleStartAdding = useCallback(() => {
    setEditingMemoId(null);
    setIsAdding(true);
  }, []);
  const addButtonStyle = useCallback(
    ({ pressed, hovered = false }: { pressed: boolean; hovered?: boolean }) =>
      iconButtonChromeStyle({ size: "large", state: { hovered: Boolean(hovered), pressed } }),
    [],
  );
  const handleClearMemos = useCallback(() => {
    void clearMemos().catch(() => undefined);
  }, [clearMemos]);
  const handleCancelAdd = useCallback(() => setIsAdding(false), []);
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
      // Omitting `images` leaves the stored ones alone; an explicit array replaces them, and an
      // empty one is how removing the last image reaches the daemon.
      await updateMemo(entry.id, text, imagesChanged ? nextImages : undefined);
      setEditingMemoId(null);
    },
    [updateMemo],
  );

  // Pressing the text only appends it; the memo stays until the trash button removes it.
  const handleMemoPress = useCallback(
    (entry: AgentMemo) => {
      onAppendToComposer(entry);
    },
    [onAppendToComposer],
  );

  // Deleting is the one action that cannot be undone from the list, so the row asks in place.
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
      <View style={styles.list}>
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
      </View>
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
          {memos.length > 0 ? (
            <MemoClearButton
              label={t("common.actions.clear")}
              cancelLabel={t("common.actions.cancel")}
              onClear={handleClearMemos}
            />
          ) : null}
          <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
            <TooltipTrigger asChild>
              <Pressable
                style={addButtonStyle}
                onPress={handleStartAdding}
                accessibilityRole="button"
                accessibilityLabel={t("common.actions.add")}
                testID="agent-memo-add"
              >
                <ThemedAddPlus size={ICON_SIZE.lg} uniProps={mutedIconMapping} />
              </Pressable>
            </TooltipTrigger>
            <TooltipContent side="top" align="end" offset={8}>
              <Text style={styles.tooltipText}>{t("common.actions.add")}</Text>
            </TooltipContent>
          </Tooltip>
        </View>
      </View>
      <AttachmentLightbox source={lightboxSource} onClose={handleCloseLightbox} />
    </View>
  );
});

/**
 * The header's clear button: the row trash icon, asking in place first. The tooltip sits on a
 * wrapper view because `InlineConfirm` is a function component and cannot receive the ref the
 * tooltip needs; the wrapper is sized to the trigger and hover lands on it either way.
 */
const MemoClearButton = memo(function MemoClearButton({
  label,
  cancelLabel,
  onClear,
}: {
  label: string;
  cancelLabel: string;
  onClear: () => void;
}) {
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <View style={styles.clearButtonHost} collapsable={false}>
          <InlineConfirm
            triggerLabel={label}
            triggerStyle={styles.clearButton}
            cancelLabel={cancelLabel}
            confirmLabel={label}
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
 * One memo being edited. Binding the entry here keeps the composer's submit callback stable, so
 * the row mapping stays free of per-render closures.
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
 * Newest action first: adding, editing and ticking a memo all make it the top row. Ticking
 * therefore lifts a memo instead of dropping it into a finished pile at the bottom — the list
 * answers "what did I just touch", not "what is still open".
 */
function orderMemos(memos: readonly AgentMemo[]): AgentMemo[] {
  return [...memos].sort((a, b) => memoActivityTime(b) - memoActivityTime(a));
}

function memoActivityTime(entry: AgentMemo): number {
  const stamp = entry.updatedAt ?? entry.createdAt;
  const parsed = Date.parse(stamp);
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
        <Pressable
          style={styles.checkButton}
          onPress={handleToggleCompleted}
          accessibilityRole="checkbox"
          accessibilityState={accessibilityState}
          accessibilityLabel={isCompleted ? t("agentMemos.markNotDone") : t("agentMemos.markDone")}
          testID={`agent-memo-toggle-${entry.id}`}
          hitSlop={6}
        >
          {isCompleted ? <ThemedCheckCircle2 size={14} /> : <ThemedCircle size={14} />}
        </Pressable>
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
        triggerLabel={t("common.actions.delete")}
        triggerStyle={styles.deleteButton}
        cancelLabel={t("common.actions.cancel")}
        confirmLabel={t("common.actions.delete")}
        onConfirm={handleDelete}
        destructive
        testID={`agent-memo-delete-${entry.id}`}
      >
        <ThemedTrash2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
      </InlineConfirm>
    </View>
  );
}

/** One truncated line: a press appends it to the composer, a right click opens the menu. */
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
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={completed ? styles.memoTextCompleted : styles.memoText}
      >
        {text}
      </Text>
    </ContextMenuTrigger>
  );
}

/** Inline base64 is the storage shape, so a memo image needs no URL resolution. */
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
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t("composer.attachments.openImage")}
      testID="agent-memo-image"
    >
      <Image source={source} style={styles.memoImage} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    gap: theme.spacing[2],
    minWidth: 0,
  },
  /** Beside the composer: the gutter stretches, the rows read top to bottom. */
  containerGutter: {
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  /** Above the composer: the list owns the full width of the input column. */
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
  /** Without the title the add button is the header's only child, so it keeps the trailing edge. */
  headerTrailing: {
    justifyContent: "flex-end",
  },
  /** Clear and add sit together at the trailing edge. */
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
    // The border is the background's opposite, so it shows exactly when the image itself does
    // not: a dark screenshot on a dark surface still reads as a picture.
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
  },
  memoTextCompleted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textDecorationLine: "line-through",
  },
  checkButton: {
    padding: theme.spacing[1],
  },
  deleteButton: {
    padding: theme.spacing[1],
  },
  clearButton: {
    padding: theme.spacing[1],
  },
  /** The tooltip's ref host; the trigger keeps its own padding. */
  clearButtonHost: {
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
