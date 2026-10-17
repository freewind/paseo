import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { CheckCircle2, Circle, ClipboardList, Plus, Trash2 } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { AgentMemo } from "@getpaseo/protocol/messages";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditingTextInput } from "@/components/ui/text-input";
import type { Theme } from "@/styles/theme";
import { useAgentMemos } from "./use-agent-memos";
import { useHostFeature } from "@/runtime/host-features";

const ThemedClipboardList = withUnistyles(ClipboardList);
const ThemedTrash2 = withUnistyles(Trash2);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedCircle = withUnistyles(Circle, mutedIconMapping);
const completedIconMapping = (theme: Theme) => ({ color: theme.colors.accent });
const ThemedCheckCircle2 = withUnistyles(CheckCircle2, completedIconMapping);

/**
 * The agent's memos, in the gutter beside the transcript.
 *
 * A memo is one line collapsed; hovering (web) or long-pressing opens its full text.
 * The list behaves like a todo list: pressing the text appends it to the composer on a
 * new line and leaves the memo in place, the checkbox marks it done, and only the trash
 * button removes it. Completion is stored on the daemon with the memo, so every client
 * sees the same state.
 */
export const AgentMemosRail = memo(function AgentMemosRail({
  serverId,
  agentId,
  onAppendToComposer,
}: {
  serverId: string;
  agentId: string;
  /** Appends text to the composer without sending; returns the previous text for undo. */
  onAppendToComposer: (text: string) => void;
}) {
  const { t } = useTranslation();
  const supported = useHostFeature(serverId, "agentMemos");
  const supportsCompletion = useHostFeature(serverId, "agentMemoCompletion");
  const { memos, addMemo, setMemoCompleted, deleteMemo } = useAgentMemos({ serverId, agentId });
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback(() => setIsExpanded((open) => !open), []);
  const handleMemoDelete = useCallback(
    (memoId: string) => void deleteMemo(memoId).catch(() => undefined),
    [deleteMemo],
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

  if (!supported) {
    return null;
  }

  return (
    <View style={styles.container} testID="agent-memos-rail">
      <Pressable
        style={styles.toggle}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={t("agentMemos.toggle")}
        testID="agent-memos-toggle"
      >
        <ThemedClipboardList size={14} />
        {memos.length > 0 ? <Text style={styles.count}>{memos.length}</Text> : null}
      </Pressable>
      {isExpanded ? (
        <View style={styles.list}>
          {memos.length === 0 ? (
            <Text style={styles.empty}>{t("agentMemos.empty")}</Text>
          ) : (
            memos.map((entry) => (
              <AgentMemoRow
                key={entry.id}
                entry={entry}
                supportsCompletion={supportsCompletion}
                onUse={handleMemoPress}
                onCompletedChange={handleMemoCompletedChange}
                onDelete={handleMemoDelete}
              />
            ))
          )}
          <AddMemoRow onAdd={addMemo} />
        </View>
      ) : null}
    </View>
  );
});

const ThemedAddPlus = withUnistyles(Plus);

function AgentMemoRow({
  entry,
  supportsCompletion,
  onUse,
  onCompletedChange,
  onDelete,
}: {
  entry: AgentMemo;
  supportsCompletion: boolean;
  onUse: (text: string) => void;
  onCompletedChange: (memoId: string, completed: boolean) => void;
  onDelete: (memoId: string) => void;
}) {
  const { t } = useTranslation();
  const isCompleted = entry.completed === true;
  const handleUse = useCallback(() => onUse(entry.text), [entry.text, onUse]);
  const handleToggleCompleted = useCallback(
    () => onCompletedChange(entry.id, !isCompleted),
    [entry.id, isCompleted, onCompletedChange],
  );
  const handleDelete = useCallback(() => onDelete(entry.id), [entry.id, onDelete]);
  const accessibilityState = useMemo(() => ({ checked: isCompleted }), [isCompleted]);
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
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Pressable
            style={styles.memoButton}
            onPress={handleUse}
            accessibilityRole="button"
            accessibilityLabel={t("agentMemos.useMemo")}
            testID={`agent-memo-item-${entry.id}`}
          >
            <Text
              numberOfLines={1}
              style={isCompleted ? styles.memoTextCompleted : styles.memoText}
            >
              {entry.text}
            </Text>
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="left" align="center" offset={8}>
          <Text style={styles.tooltipText}>{entry.text}</Text>
        </TooltipContent>
      </Tooltip>
      <Pressable
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={t("agentMemos.delete")}
        testID={`agent-memo-delete-${entry.id}`}
        style={styles.deleteButton}
        hitSlop={6}
      >
        <ThemedTrash2 size={13} />
      </Pressable>
    </View>
  );
}

function AddMemoRow({ onAdd }: { onAdd: (text: string) => void }) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const handleStartAdding = useCallback(() => setIsAdding(true), []);
  const handleCancel = useCallback(() => setIsAdding(false), []);
  const submit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setIsAdding(false);
      setDraft("");
      return;
    }
    onAdd(trimmed);
    setDraft("");
    setIsAdding(false);
  }, [draft, onAdd]);

  if (!isAdding) {
    return (
      <Pressable
        style={styles.addRow}
        onPress={handleStartAdding}
        accessibilityRole="button"
        accessibilityLabel={t("agentMemos.add")}
        testID="agent-memo-add"
      >
        <ThemedAddPlus size={13} />
        <Text style={styles.addText}>{t("agentMemos.add")}</Text>
      </Pressable>
    );
  }

  return <MemoInput draft={draft} setDraft={setDraft} submit={submit} cancel={handleCancel} />;
}

function MemoInput({
  draft,
  setDraft,
  submit,
  cancel,
}: {
  draft: string;
  setDraft: (text: string) => void;
  submit: () => void;
  cancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.addRow}>
      <EditingTextInput
        initialValue={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        onBlur={cancel}
        placeholder={t("agentMemos.placeholder")}
        autoFocus
        multiline={false}
        style={styles.input}
        testID="agent-memo-input"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: theme.spacing[1],
    top: "10%",
    zIndex: 3,
    alignItems: "flex-start",
    gap: theme.spacing[1],
  },
  toggle: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    gap: 2,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  list: {
    maxWidth: 260,
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[2],
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
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
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
    maxWidth: 320,
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
  input: {
    flex: 1,
    minWidth: 160,
  },
}));
