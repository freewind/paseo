import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { resolveSideRailWidth } from "@/agent-stream/chat-outline/text-rail-model";
import { useContainerWidth } from "@/hooks/use-container-width";

/**
 * 窗格右侧的常驻面板。宽度预算与大纲共用 `resolveSideRailWidth`，窄到没缝时不渲染、
 * 也不为它留白；竖向范围不共用：大纲是一段缝里的路标，面板是整天立在那里的工具。
 * 普通 Agent 和草稿共用这套测量与放置规则。
 */
export function RightGutter({
  children,
  contentMaxWidth,
}: {
  children: ReactNode;
  contentMaxWidth: number;
}) {
  const { onLayout, width } = useContainerWidth();
  const railWidth = resolveSideRailWidth(width, contentMaxWidth);

  // 测量用的外层始终挂载，只隐藏栏本身：窄屏时连它一起去掉，宽度就永远是 0，再拖宽也回不来。
  return (
    <View style={styles.measure} pointerEvents="box-none" onLayout={onLayout}>
      {children != null && railWidth !== null ? (
        <View style={[styles.rail, { width: railWidth }]} testID="agent-panel-right-gutter">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // 只量宽、不占位；竖向铺满整列，让面板从顶端开始读，而不是浮在对话中段。
  measure: {
    position: "absolute",
    inset: 0,
  },
  rail: {
    position: "absolute",
    right: theme.spacing[2],
    top: theme.spacing[4],
    bottom: theme.spacing[4],
    zIndex: 2,
  },
}));
