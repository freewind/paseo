import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import type { Theme } from "@/styles/theme";
import type { TodoEntry } from "@/types/stream";

const ThemedCircle = withUnistyles(Circle);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedChevronDown = withUnistyles(ChevronDown);
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

function ExpandChevron({ hasBody, expanded }: { hasBody: boolean; expanded: boolean }) {
  if (!hasBody) return null;
  if (expanded) return <ThemedChevronDown size={14} uniProps={extraMutedIcon} />;
  return <ThemedChevronRight size={14} uniProps={extraMutedIcon} />;
}

export const TaskListRow = memo(function TaskListRow({ task }: { task: TodoEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = task.completed || task.status === "completed";
  const isRunning = !isCompleted && task.status === "in_progress";
  const text = isRunning && task.activeForm ? task.activeForm : task.text;
  const taskId = task.id?.trim();
  // 只有带正文的行才可点：点了什么都不展开的行就是一个死控件。
  const description = task.description?.trim();
  const handlePress = useCallback(() => setExpanded((value) => !value), []);
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);

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
      <ExpandChevron hasBody={Boolean(description)} expanded={expanded} />
    </View>
  );

  if (!description) return row;

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      highlightStyle={styles.pressed}
    >
      {row}
      {expanded ? <Text style={[styles.description]}>{description}</Text> : null}
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
  // 正文接在标题下方，缩进对齐到标题起点：状态图标宽 16，加上 row 的 gap。
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.base,
    paddingLeft: 16 + theme.spacing[2],
    paddingTop: theme.spacing[1],
  },
  pressed: {
    backgroundColor: theme.colors.interactionHighlight,
  },
}));
