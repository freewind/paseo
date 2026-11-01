import { memo, useSyncExternalStore } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useIsCompactFormFactor } from "@/constants/layout";
import { shouldShowQuickRepliesRail } from "@/quick-replies/layout";
import { resolveSideRailWidth } from "./text-rail-model";
import type { ChatOutlineTextRailProps } from "./text-rail";
import { ChatOutlineTextList } from "./text-rail-list";

export const ChatOutlineTextRail = memo(function ChatOutlineTextRail({
  prompts,
  activePrompt,
  onJumpToPrompt,
  contentMaxWidth,
  agentId,
}: ChatOutlineTextRailProps) {
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const { onLayout, width: panelWidth } = useContainerWidth();
  const compact = useIsCompactFormFactor();

  // 面板还没量出宽度时只留测量层。0 表示「未渲染」而不是「很窄」，不能拿它算宽度。
  if (panelWidth === 0) {
    return <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout} />;
  }

  const showRail = shouldShowQuickRepliesRail({
    enabled: true,
    compact,
    paneWidth: panelWidth,
    contentMaxWidth,
  });
  const textRailWidth = resolveSideRailWidth(panelWidth, contentMaxWidth);

  return (
    <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout}>
      {showRail && textRailWidth !== null && prompts.length > 0 ? (
        <ChatOutlineTextList
          // 换一个 chat 就是另一份大纲，新实例才会重读自己的折叠状态。
          key={agentId}
          prompts={prompts}
          activeSeq={activeSeq}
          width={textRailWidth}
          agentId={agentId}
          onJumpToPrompt={onJumpToPrompt}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create(() => ({
  panelMeasure: {
    position: "absolute",
    inset: 0,
  },
}));
