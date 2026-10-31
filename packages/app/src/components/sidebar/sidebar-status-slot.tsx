import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleAlert } from "lucide-react-native";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import {
  STATUS_INDICATOR_ALERT_SIZE,
  STATUS_INDICATOR_DOT_SIZE,
  STATUS_INDICATOR_FILLED_DOT_SIZE,
} from "@/utils/status-indicator-geometry";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";
import { StatusRing } from "@/components/status-ring";

const needsInputColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
  fill: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
});

const ThemedCircleAlert = withUnistyles(CircleAlert);

/** 工作区行和它下面的 agent 行共用这一个槽位；抄两份映射就会各自漂。 */
export function SidebarStatusSlot({
  bucket,
  leadingVisual,
  loading = false,
  reserveIdleSpace = true,
  testID,
}: {
  bucket: SidebarStateBucket | null | undefined;
  leadingVisual?: ReactNode;
  loading?: boolean;
  reserveIdleSpace?: boolean;
  testID: string;
}) {
  // 侧栏每个状态都占这一个槽，busy 得填满它又不能挤走别的，所以用环不用点。
  if (loading) {
    return (
      <View style={styles.slot} testID={`${testID}-loading`}>
        <StatusRing />
      </View>
    );
  }

  if (shouldRenderSyncedStatusLoader({ bucket })) {
    return (
      <View style={styles.slot} testID={`${testID}-running`}>
        <StatusRing />
      </View>
    );
  }

  if (bucket === "needs_input") {
    return (
      <View style={styles.slot} testID={`${testID}-needs_input`}>
        <ThemedCircleAlert size={STATUS_INDICATOR_ALERT_SIZE} uniProps={needsInputColorMapping} />
      </View>
    );
  }

  if (bucket === "attention") {
    return (
      <View style={styles.slot} testID={`${testID}-attention`}>
        <View style={styles.standaloneStatusDot} />
      </View>
    );
  }

  if (bucket === "done") {
    // 空闲也留个暗点：嵌套行只靠缩进标识，槽位空了就没有竖线可读。
    return reserveIdleSpace ? (
      <View style={styles.slot} testID={`${testID}-done`}>
        <View style={styles.idleStatusDot} />
      </View>
    ) : null;
  }

  // tab 可能比它指的 agent 先到（从磁盘恢复时），槽位先占住宽度，标题才不会跳。
  if (!bucket) {
    return (
      <View style={styles.slot} testID={`${testID}-null`}>
        {leadingVisual}
      </View>
    );
  }

  const dotColorStyle = getStatusDotColorStyle(bucket);
  return (
    <View style={styles.slot} testID={`${testID}-${bucket}`}>
      {leadingVisual}
      {dotColorStyle ? <StatusDotOverlay dotColorStyle={dotColorStyle} /> : null}
    </View>
  );
}

function StatusDotOverlay({ dotColorStyle }: { dotColorStyle: ViewStyle }) {
  return <View style={[styles.statusDotOverlay, dotColorStyle]} />;
}

function getStatusDotColorStyle(bucket: SidebarStateBucket | null | undefined) {
  if (bucket === "needs_input") return styles.statusDotNeedsInput;
  if (bucket === "failed") return styles.statusDotFailed;
  if (bucket === "running") return styles.statusDotRunning;
  if (bucket === "attention") return styles.statusDotAttention;
  return null;
}

const TITLE_LINE_HEIGHT = 20;

const styles = StyleSheet.create((theme) => ({
  slot: {
    position: "relative",
    width: theme.iconSize.md,
    height: TITLE_LINE_HEIGHT,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: STATUS_INDICATOR_DOT_SIZE,
    height: STATUS_INDICATOR_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  standaloneStatusDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
  },
  idleStatusDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundExtraMuted,
    opacity: 0.3,
  },
  statusDotNeedsInput: {
    backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotFailed: {
    backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotRunning: {
    backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotAttention: {
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
}));
