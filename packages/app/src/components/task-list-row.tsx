import { ChevronRight, Circle, CircleCheck, CircleDot } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import type { Theme } from "@/styles/theme";
import type { TodoEntry } from "@/types/stream";

const ThemedCircle = withUnistyles(Circle);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedChevronRight = withUnistyles(ChevronRight);

const extraMutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });
const runningIcon = (theme: Theme) => ({ color: theme.colors.statusDotRunning });

function TaskStatusIcon({ isCompleted, isRunning }: { isCompleted: boolean; isRunning: boolean }) {
  if (isCompleted) {
    return <ThemedCircleCheck size={16} uniProps={extraMutedIcon} />;
  }
  if (isRunning) {
    return <ThemedCircleDot size={16} uniProps={runningIcon} />;
  }
  // A pending task's ring is a status mark, not a checkbox. At the muted step it carries the
  // weight of an enabled control and invites a click that does nothing, so it sits one step back
  // from the text it marks.
  return <ThemedCircle size={16} uniProps={extraMutedIcon} />;
}

export const TaskListRow = memo(function TaskListRow({
  task,
  onPress,
}: {
  task: TodoEntry;
  onPress?: (task: TodoEntry) => void;
}) {
  const isCompleted = task.completed || task.status === "completed";
  const isRunning = !isCompleted && task.status === "in_progress";
  const text = isRunning && task.activeForm ? task.activeForm : task.text;
  const taskId = task.id?.trim();
  const handlePress = useCallback(() => onPress?.(task), [onPress, task]);
  const accessibilityState = useMemo(() => ({ expanded: false }), []);

  const row = (
    <View style={styles.row} accessibilityLabel={text}>
      <TaskStatusIcon isCompleted={isCompleted} isRunning={isRunning} />
      {taskId ? (
        <Text numberOfLines={1} style={styles.id}>
          {taskId}
        </Text>
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.text, isRunning && styles.runningText, isCompleted && styles.completedText]}
      >
        {text}
      </Text>
      {onPress ? <ThemedChevronRight size={14} uniProps={extraMutedIcon} /> : null}
    </View>
  );

  if (!onPress) return row;

  // 点开的是详情弹层：整行可点，行内不再就地展开正文。
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      highlightStyle={styles.pressed}
    >
      {row}
    </PressHighlight>
  );
});

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  // 编号比标题弱一档，等宽字体和标题区分开；某些 provider 会给出 uuid 形态的长 id，
  // 固定宽度上限加单行截断，保证它永远抢不掉标题的位置；行太窄时先缩 id。
  id: {
    maxWidth: 96,
    flexShrink: 1,
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  // Grows and shrinks, but keeps an `auto` basis: a zero-basis label reports no intrinsic width,
  // and a container that sizes itself to its content — the composer track panel — measures the
  // row as empty and truncates it against a surface that had room to spare.
  text: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  runningText: {
    color: theme.colors.foreground,
  },
  completedText: {
    color: theme.colors.foregroundExtraMuted,
    textDecorationLine: "line-through",
  },
  pressed: {
    backgroundColor: theme.colors.interactionHighlight,
  },
}));
