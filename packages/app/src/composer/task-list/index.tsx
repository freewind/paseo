import { memo, useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { ComposerTrackPill, ComposerTrackRow } from "@/composer/tracks";
import { TaskDetailSheet } from "@/components/task-detail-sheet";
import { PressHighlight } from "@/components/ui/press-highlight";
import { TaskListRow } from "@/components/task-list-row";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { TodoEntry } from "@/types/stream";

export const AgentTaskList = memo(function AgentTaskList({
  tasks,
  serverId,
  agentId,
}: {
  tasks: TodoEntry[] | undefined;
  serverId?: string;
  agentId?: string;
}) {
  if (!tasks?.length) return null;
  return <TaskListCard tasks={tasks} serverId={serverId} agentId={agentId} />;
});

const TaskListCard = memo(function TaskListCard({
  tasks,
  serverId,
  agentId,
}: {
  tasks: TodoEntry[];
  serverId?: string;
  agentId?: string;
}) {
  const { t } = useTranslation();
  const [selectedTask, setSelectedTask] = useState<TodoEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const completed = useMemo(
    () => tasks.filter((task) => task.completed || task.status === "completed").length,
    [tasks],
  );
  // Counts only. The active task used to ride along in the header, where it was the first thing
  // truncated on a phone; the panel shows it in full, in place, with the rest of the list.
  const label = t("message.todo.tasksProgress", { completed, total: tasks.length });
  const segments = useMemo(() => [{ bucket: null, text: label }], [label]);

  // 只有 daemon 报了这个能力位、并且知道 agent 是谁时，行才可点开编辑。
  const editable = useMemo(() => {
    if (!serverId || !agentId) return false;
    return (
      getHostRuntimeStore().getClient(serverId)?.getLastServerInfoMessage()?.features
        ?.todoMutation === true
    );
  }, [serverId, agentId]);

  const handleCreatePress = useCallback(() => setCreating(true), []);
  const handleDismiss = useCallback(() => {
    setSelectedTask(null);
    setCreating(false);
  }, []);

  return (
    <>
      <ComposerTrackPill
        testID="agent-task-list-header"
        segments={segments}
        panelTitle={t("message.todo.title")}
      >
        {tasks.map((task, index) => (
          <ComposerTrackRow key={task.id ?? `${index}:${task.text}`}>
            <View style={styles.taskRow}>
              <TaskListRow task={task} onPress={editable ? setSelectedTask : undefined} />
            </View>
          </ComposerTrackRow>
        ))}
        {editable ? (
          <ComposerTrackRow>
            <PressHighlight
              onPress={handleCreatePress}
              accessibilityRole="button"
              style={styles.addRow}
              highlightStyle={styles.pressed}
            >
              <Text style={styles.addText}>{t("message.todo.detail.newTask")}</Text>
            </PressHighlight>
          </ComposerTrackRow>
        ) : null}
      </ComposerTrackPill>
      {selectedTask && serverId && agentId ? (
        <TaskDetailSheet
          key={selectedTask.id ?? selectedTask.text}
          visible
          serverId={serverId}
          agentId={agentId}
          task={selectedTask}
          onClose={handleDismiss}
        />
      ) : null}
      {creating && serverId && agentId ? (
        <TaskDetailSheet
          key="new-task"
          visible
          serverId={serverId}
          agentId={agentId}
          task={null}
          onClose={handleDismiss}
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  // The task row draws its own icon and text; this only lets it span the shared row frame.
  // Basis stays `auto` so the text's width reaches the panel's measurement — see track.tsx.
  taskRow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
  },
  addRow: {
    paddingVertical: theme.spacing[1],
    paddingLeft: 16 + theme.spacing[2],
  },
  addText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  pressed: {
    backgroundColor: theme.colors.interactionHighlight,
  },
}));
