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
 * asks before deleting. The header carries the add button, matching the quick replies bar on the
 * opposite gutter. Completion lives on the daemon with the memo, so every client sees it.
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
  const { memos, addMemo, updateMemo, setMemoCompleted, deleteMemo } = useAgentMemos({
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
              submitLabel={t("agentMemos.save")}
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
        <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild>
            <Pressable
              style={styles.addButton}
              onPress={handleStartAdding}
              accessibilityRole="button"
              accessibilityLabel={t("agentMemos.add")}
              testID="agent-memo-add"
            >
              <ThemedAddPlus size={ICON_SIZE.lg} uniProps={mutedIconMapping} />
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" offset={8}>
            <Text style={styles.tooltipText}>{t("agentMemos.add")}</Text>
          </TooltipContent>
        </Tooltip>
      </View>
      <AttachmentLightbox source={lightboxSource} onClose={handleCloseLightbox} />
    </View>
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
 * Open memos first, completed ones last. Both groups keep the daemon's order, so ticking a memo
 * moves it down without reshuffling the rest.
 */
function orderMemos(memos: readonly AgentMemo[]): AgentMemo[] {
  const open: AgentMemo[] = [];
  const completed: AgentMemo[] = [];
  for (const entry of memos) {
    if (entry.completed === true) {
      completed.push(entry);
    } else {
      open.push(entry);
    }
  }
  return [...open, ...completed];
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
              <ContextMenuTrigger
                style={styles.memoButton}
                onPress={handleUse}
                accessibilityRole="button"
                accessibilityLabel={t("agentMemos.useMemo")}
                testID={`agent-memo-item-${entry.id}`}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={isCompleted ? styles.memoTextCompleted : styles.memoText}
                >
                  {entry.text}
                </Text>
              </ContextMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" offset={6} maxWidth={420}>
              <Text style={styles.tooltipText}>{entry.text}</Text>
            </TooltipContent>
          </Tooltip>
          <ContextMenuContent align="start" width={200} testID={`agent-memo-menu-${entry.id}`}>
            <ContextMenuItem onSelect={handleUse}>{t("composer.input.send")}</ContextMenuItem>
            <ContextMenuItem onSelect={handleEdit}>{t("agentMemos.edit")}</ContextMenuItem>
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
        triggerLabel={t("agentMemos.delete")}
        triggerStyle={styles.deleteButton}
        cancelLabel={t("common.actions.cancel")}
        confirmLabel={t("agentMemos.delete")}
        onConfirm={handleDelete}
        destructive
        testID={`agent-memo-delete-${entry.id}`}
      >
        <ThemedTrash2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
      </InlineConfirm>
    </View>
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
  memoButton: {
    flex: 1,
    minWidth: 0,
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
  addButton: {
    flexShrink: 0,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
