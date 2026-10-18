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
import { encodeAttachmentsForSend } from "@/attachments/service";
import type { AttachmentMetadata } from "@/attachments/types";
import { confirmDialog } from "@/utils/confirm-dialog";
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

/**
 * The agent's memos as a standing todo list: the composer's left gutter on a wide layout, and a
 * row above the composer on a compact one.
 *
 * Open memos come first and completed ones sink to the bottom, struck through and dimmed, each
 * group keeping the daemon's creation order. Pressing the text appends it to the composer and
 * leaves the memo in place; the context menu sends it, the checkbox toggles completion, and the
 * trash button asks before deleting. Completion lives on the daemon with the memo, so every
 * client sees the same state.
 */
export const AgentMemosRail = memo(function AgentMemosRail({
  serverId,
  agentId,
  compact = false,
  onAppendToComposer,
}: {
  serverId: string;
  agentId: string;
  /** Compact hosts show the icon alone: the list sits above the composer, not beside it. */
  compact?: boolean;
  /** Appends text to the composer without sending; returns the previous text for undo. */
  onAppendToComposer: (text: string) => void;
}) {
  const { t } = useTranslation();
  const supported = useHostFeature(serverId, "agentMemos");
  const supportsCompletion = useHostFeature(serverId, "agentMemoCompletion");
  const supportsImages = useHostFeature(serverId, "agentMemoImages");
  const { memos, addMemo, setMemoCompleted, deleteMemo } = useAgentMemos({ serverId, agentId });
  const [isAdding, setIsAdding] = useState(false);
  const [lightboxSource, setLightboxSource] = useState<ImageLightboxSource | null>(null);

  const orderedMemos = useMemo(() => orderMemos(memos), [memos]);

  const handleStartAdding = useCallback(() => setIsAdding(true), []);
  const handleCancelAdd = useCallback(() => setIsAdding(false), []);
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

  // Pressing the text only appends it; the memo stays until the trash button removes it.
  const handleMemoPress = useCallback(
    (text: string) => {
      onAppendToComposer(text);
    },
    [onAppendToComposer],
  );

  // Deleting is the one action that cannot be undone from the list, so it asks first.
  const handleRequestDelete = useCallback(
    async (entry: AgentMemo) => {
      const confirmed = await confirmDialog({
        title: t("agentMemos.delete"),
        message: entry.text,
        confirmLabel: t("agentMemos.delete"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      await deleteMemo(entry.id).catch(() => undefined);
    },
    [deleteMemo, t],
  );

  if (!supported) {
    return null;
  }

  return (
    <View
      style={[styles.container, compact ? styles.containerCompact : styles.containerGutter]}
      testID="agent-memos-rail"
    >
      <View style={styles.header}>
        <ThemedClipboardList size={ICON_SIZE.md} uniProps={mutedIconMapping} />
        {compact ? null : (
          <Text style={styles.title} numberOfLines={1}>
            {t("agentMemos.toggle")}
          </Text>
        )}
      </View>
      <View style={styles.list}>
        {orderedMemos.length === 0 ? (
          <Text style={styles.empty}>{t("agentMemos.empty")}</Text>
        ) : (
          orderedMemos.map((entry) => (
            <AgentMemoRow
              key={entry.id}
              entry={entry}
              supportsCompletion={supportsCompletion}
              onUse={handleMemoPress}
              onCompletedChange={handleMemoCompletedChange}
              onRequestDelete={handleRequestDelete}
              onOpenImage={handleOpenMemoImage}
            />
          ))
        )}
        {isAdding ? (
          <AgentMemoComposer
            onSubmit={handleAddMemo}
            onCancel={handleCancelAdd}
            canAttachImages={supportsImages}
          />
        ) : (
          <Pressable
            style={styles.addRow}
            onPress={handleStartAdding}
            accessibilityRole="button"
            accessibilityLabel={t("agentMemos.add")}
            testID="agent-memo-add"
          >
            <ThemedAddPlus size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
            <Text style={styles.addText}>{t("agentMemos.add")}</Text>
          </Pressable>
        )}
      </View>
      <AttachmentLightbox source={lightboxSource} onClose={handleCloseLightbox} />
    </View>
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
  onOpenImage,
}: {
  entry: AgentMemo;
  supportsCompletion: boolean;
  onUse: (text: string) => void;
  onCompletedChange: (memoId: string, completed: boolean) => void;
  onRequestDelete: (entry: AgentMemo) => void;
  onOpenImage: (image: ImageAttachment) => void;
}) {
  const { t } = useTranslation();
  const isCompleted = entry.completed === true;
  const handleUse = useCallback(() => onUse(entry.text), [entry.text, onUse]);
  const handleToggleCompleted = useCallback(
    () => onCompletedChange(entry.id, !isCompleted),
    [entry.id, isCompleted, onCompletedChange],
  );
  const handleDelete = useCallback(() => onRequestDelete(entry), [entry, onRequestDelete]);
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
          <ContextMenuTrigger
            style={styles.memoButton}
            onPress={handleUse}
            accessibilityRole="button"
            accessibilityLabel={t("agentMemos.useMemo")}
            testID={`agent-memo-item-${entry.id}`}
          >
            <Text
              numberOfLines={2}
              style={isCompleted ? styles.memoTextCompleted : styles.memoText}
            >
              {entry.text}
            </Text>
          </ContextMenuTrigger>
          <ContextMenuContent align="start" width={200} testID={`agent-memo-menu-${entry.id}`}>
            <ContextMenuItem onSelect={handleUse}>{t("composer.input.send")}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {entry.images && entry.images.length > 0 ? (
          <View style={styles.memoImageRow}>
            {memoImageEntries.map(({ key, image }) => (
              <MemoImageThumb key={key} image={image} onOpen={onOpenImage} />
            ))}
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={t("agentMemos.delete")}
        testID={`agent-memo-delete-${entry.id}`}
        style={styles.deleteButton}
        hitSlop={6}
      >
        <ThemedTrash2 size={ICON_SIZE.sm} uniProps={mutedIconMapping} />
      </Pressable>
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
    gap: theme.spacing[2],
    minWidth: 0,
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
    gap: theme.spacing[1],
  },
  memoImageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  memoImage: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.sm,
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
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  addText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
