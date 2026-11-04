import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  IsolatedBottomSheetModal,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import { PressHighlight } from "@/components/ui/press-highlight";
import { EditingTextInput } from "@/components/ui/text-input";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { TodoEntry } from "@/types/stream";

const STATUSES = ["pending", "in_progress", "completed"] as const;
type TaskStatus = (typeof STATUSES)[number];

const STATUS_LABEL_KEY: Record<TaskStatus, string> = {
  pending: "message.todo.detail.statusPending",
  in_progress: "message.todo.detail.statusInProgress",
  completed: "message.todo.detail.statusCompleted",
};

const SHEET_SNAP_POINTS = ["70%", "95%"];

const ThemedSheet = withUnistyles(IsolatedBottomSheetModal, (theme) => ({
  backgroundStyle: {
    backgroundColor: theme.colors.surface2,
    borderRadius: 16,
  },
  handleIndicatorStyle: {
    backgroundColor: theme.colors.palette.zinc[600],
  },
}));

type MutationInput = Parameters<NonNullable<ReturnType<typeof getClient>>["mutateAgentTasks"]>[1];

export interface TaskDetailSheetProps {
  visible: boolean;
  serverId: string;
  agentId: string;
  /** null 表示新建任务。 */
  task: TodoEntry | null;
  /** 没有写通道时只能看：隐藏所有编辑控件。 */
  editable?: boolean;
  onClose: () => void;
}

/**
 * 任务详情弹层：展示任务的全部字段，并允许增删改。
 * 改动走 daemon 的 `agent.tasks.mutate`，最终写回 pi 扩展里的真实任务状态。
 */
export function TaskDetailSheet({
  visible,
  serverId,
  agentId,
  task,
  editable = true,
  onClose,
}: TaskDetailSheetProps) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState(task?.text ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [activeForm, setActiveForm] = useState(task?.activeForm ?? "");
  const [owner, setOwner] = useState(task?.owner ?? "");
  const [status, setStatus] = useState<TaskStatus>(() => normalizeStatus(task));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibility = useIsolatedBottomSheetVisibility({ visible, onClose });

  const run = useCallback(
    async (mutation: MutationInput) => {
      const client = getClient(serverId);
      if (!client) {
        setError(t("message.todo.detail.saveFailed"));
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const items = await client.mutateAgentTasks(agentId, mutation);
        useSessionStore.getState().setAgentStreamState(serverId, agentId, {
          taskSnapshot: items as TodoEntry[],
        });
        onClose();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("message.todo.detail.saveFailed"));
      } finally {
        setBusy(false);
      }
    },
    [agentId, onClose, serverId, t],
  );

  const handleSave = useCallback(
    (next: { subject: string; status: TaskStatus }) => {
      // 新建时只能建 pending（reducer 不认 create 的 status），所以空值字段直接不传，
      // 免得写入空串；修改时原样传，空串就是「清空该字段」。
      const isUpdate = Boolean(task?.id);
      const optional = (value: string) => {
        if (isUpdate) return { value };
        return value ? { value } : {};
      };
      void run({
        action: isUpdate ? "update" : "create",
        ...(task?.id ? { id: task.id } : {}),
        subject: next.subject,
        ...(isUpdate ? { status: next.status } : {}),
        ...spreadValue("description", optional(description)),
        ...spreadValue("activeForm", optional(activeForm)),
        ...spreadValue("owner", optional(owner)),
      });
    },
    [activeForm, description, owner, run, task?.id],
  );

  const handleDelete = useCallback(() => {
    if (!task?.id) return;
    void run({ action: "delete", id: task.id });
  }, [run, task?.id]);

  const formInitial = useMemo(
    () => ({
      subject,
      status,
      activeForm,
      description,
      owner,
    }),
    [activeForm, description, owner, status, subject],
  );

  return (
    <ThemedSheet
      ref={visibility.sheetRef}
      contextBridge={null}
      snapPoints={SHEET_SNAP_POINTS}
      index={0}
      enableDynamicSizing={false}
      onChange={visibility.handleSheetChange}
      onDismiss={visibility.handleSheetDismiss}
      backdropOpacity={0.45}
      enablePanDownToClose
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{resolveTitle(task, t)}</Text>
        <TaskForm
          task={task}
          initial={formInitial}
          busy={busy}
          error={error}
          editable={editable}
          onSubjectChange={setSubject}
          onStatusChange={setStatus}
          onActiveFormChange={setActiveForm}
          onDescriptionChange={setDescription}
          onOwnerChange={setOwner}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </BottomSheetScrollView>
    </ThemedSheet>
  );
}

function TaskForm({
  task,
  initial,
  busy,
  error,
  editable,
  onSubjectChange,
  onStatusChange,
  onActiveFormChange,
  onDescriptionChange,
  onOwnerChange,
  onSave,
  onDelete,
}: {
  task: TodoEntry | null;
  initial: {
    subject: string;
    status: TaskStatus;
    activeForm: string;
    description: string;
    owner: string;
  };
  busy: boolean;
  error: string | null;
  editable: boolean;
  onSubjectChange: (text: string) => void;
  onStatusChange: (next: TaskStatus) => void;
  onActiveFormChange: (text: string) => void;
  onDescriptionChange: (text: string) => void;
  onOwnerChange: (text: string) => void;
  onSave: (next: { subject: string; status: TaskStatus }) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [draftSubject, setDraftSubject] = useState(initial.subject);
  const [draftStatus, setDraftStatus] = useState(initial.status);
  const trimmed = draftSubject.trim();

  const handleSubjectChange = useCallback(
    (text: string) => {
      setDraftSubject(text);
      onSubjectChange(text);
    },
    [onSubjectChange],
  );

  const handleStatusChange = useCallback(
    (next: TaskStatus) => {
      setDraftStatus(next);
      onStatusChange(next);
    },
    [onStatusChange],
  );

  const handleSavePress = useCallback(() => {
    if (trimmed) onSave({ subject: trimmed, status: draftStatus });
  }, [draftStatus, onSave, trimmed]);

  const saveButtonStyle = trimmed && !busy ? styles.primaryButton : styles.primaryButtonDisabled;

  return (
    <>
      {editable ? (
        <StatusPickerOrHint task={task} status={draftStatus} onChange={handleStatusChange} />
      ) : null}
      <LabeledInput
        label={t("message.todo.detail.subject")}
        initialValue={initial.subject}
        onChangeText={handleSubjectChange}
        editable={editable}
        multiline
      />
      <LabeledInput
        label={t("message.todo.detail.activeForm")}
        initialValue={initial.activeForm}
        onChangeText={onActiveFormChange}
        editable={editable}
      />
      <LabeledInput
        label={t("message.todo.detail.description")}
        initialValue={initial.description}
        onChangeText={onDescriptionChange}
        editable={editable}
        multiline
      />
      <LabeledInput
        label={t("message.todo.detail.owner")}
        initialValue={initial.owner}
        onChangeText={onOwnerChange}
        editable={editable}
      />
      <ReadonlyRows task={task} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {editable ? (
        <View style={styles.actions}>
          <PressHighlight
            onPress={handleSavePress}
            disabled={!trimmed || busy}
            accessibilityRole="button"
            style={saveButtonStyle}
            highlightStyle={styles.pressed}
          >
            <Text style={styles.primaryText}>{t("message.todo.detail.save")}</Text>
          </PressHighlight>
          <DeleteButton visible={Boolean(task?.id)} busy={busy} onDelete={onDelete} />
        </View>
      ) : null}
    </>
  );
}

function DeleteButton({
  visible,
  busy,
  onDelete,
}: {
  visible: boolean;
  busy: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <PressHighlight
      onPress={onDelete}
      disabled={busy}
      accessibilityRole="button"
      style={busy ? styles.dangerButtonDisabled : styles.dangerButton}
      highlightStyle={styles.pressed}
    >
      <Text style={styles.dangerText}>{t("message.todo.detail.delete")}</Text>
    </PressHighlight>
  );
}

function StatusPickerOrHint({
  task,
  status,
  onChange,
}: {
  task: TodoEntry | null;
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
}) {
  // 新建时状态固定为 pending，不摆一个按了不生效的选择器。
  if (!task?.id) return null;
  return <StatusPicker status={status} onChange={onChange} />;
}

function StatusPicker({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.statusRow}>
      {STATUSES.map((value) => (
        <StatusChip
          key={value}
          label={t(STATUS_LABEL_KEY[value])}
          selected={status === value}
          value={value}
          onChange={onChange}
        />
      ))}
    </View>
  );
}

function StatusChip({
  label,
  selected,
  value,
  onChange,
}: {
  label: string;
  selected: boolean;
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
}) {
  const handlePress = useCallback(() => onChange(value), [onChange, value]);
  return (
    <PressHighlight
      onPress={handlePress}
      accessibilityRole="button"
      style={selected ? styles.statusChipSelected : styles.statusChip}
      highlightStyle={styles.pressed}
    >
      <Text style={selected ? styles.statusTextSelected : styles.statusText}>{label}</Text>
    </PressHighlight>
  );
}

function LabeledInput({
  label,
  initialValue,
  onChangeText,
  editable,
  multiline,
}: {
  label: string;
  initialValue: string;
  onChangeText: (text: string) => void;
  editable: boolean;
  multiline?: boolean;
}) {
  const { t } = useTranslation();
  if (!editable) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.readonly}>{initialValue || t("message.todo.detail.empty")}</Text>
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <EditingTextInput
        initialValue={initialValue}
        onChangeText={onChangeText}
        variant="bottom-sheet"
        multiline={multiline}
        style={multiline ? styles.inputMultiline : styles.input}
      />
    </View>
  );
}

function ReadonlyRows({ task }: { task: TodoEntry | null }) {
  const { t } = useTranslation();
  const blockedBy = useMemo(() => (task?.blockedBy ?? []).map((id) => `#${id}`).join(", "), [task]);
  const metadata = useMemo(() => {
    if (!task?.metadata) return null;
    const keys = Object.keys(task.metadata);
    return keys.length > 0 ? JSON.stringify(task.metadata, null, 2) : null;
  }, [task]);
  if (!blockedBy && !metadata) return null;
  return (
    <>
      {blockedBy ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t("message.todo.detail.blockedBy")}</Text>
          <Text style={styles.readonly}>{blockedBy}</Text>
        </View>
      ) : null}
      {metadata ? (
        <View style={styles.field}>
          <Text style={styles.label}>{t("message.todo.detail.metadata")}</Text>
          <Text style={styles.readonly}>{metadata}</Text>
        </View>
      ) : null}
    </>
  );
}

function resolveTitle(task: TodoEntry | null, t: (key: string) => string): string {
  if (!task?.id) return t("message.todo.detail.newTask");
  return `#${task.id} ${task.text}`;
}

function getClient(serverId: string) {
  return getHostRuntimeStore().getClient(serverId);
}

/** 把「可选字段」包成可展开的键值对：不带值就展开成空对象，等于没传这个字段。 */
function spreadValue<K extends "description" | "activeForm" | "owner">(
  key: K,
  wrapped: { value?: string },
): Partial<Record<K, string>> {
  if (wrapped.value === undefined) return {};
  return { [key]: wrapped.value } as Partial<Record<K, string>>;
}

function normalizeStatus(task: TodoEntry | null): TaskStatus {
  if (task?.status) return task.status;
  return task?.completed ? "completed" : "pending";
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  statusChip: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: 999,
    backgroundColor: theme.colors.surface1,
  },
  statusChipSelected: {
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: 999,
    backgroundColor: theme.colors.interactionHighlight,
  },
  statusText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  statusTextSelected: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  field: {
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  input: {
    backgroundColor: theme.colors.surface1,
    borderRadius: 8,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  inputMultiline: {
    minHeight: 96,
    backgroundColor: theme.colors.surface1,
    borderRadius: 8,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  readonly: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  primaryButton: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
  },
  primaryButtonDisabled: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    borderRadius: 8,
    backgroundColor: theme.colors.accent,
    opacity: 0.5,
  },
  primaryText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.base,
    fontWeight: "600",
  },
  dangerButton: {
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: 8,
    backgroundColor: theme.colors.surface1,
  },
  dangerButtonDisabled: {
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    borderRadius: 8,
    backgroundColor: theme.colors.surface1,
    opacity: 0.5,
  },
  dangerText: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.base,
  },
  pressed: {
    opacity: 0.8,
  },
}));
