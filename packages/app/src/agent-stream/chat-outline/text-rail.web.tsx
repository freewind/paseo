import { memo, useSyncExternalStore } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useContainerWidth } from "@/hooks/use-container-width";
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

  if (prompts.length < 2) return null;

  // 还没有缝可以放大纲时也要测量，免得大纲出现时转录列跟着改尺寸。
  const textRailWidth = resolveSideRailWidth(panelWidth, contentMaxWidth);

  if (textRailWidth === null) {
    return <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout} />;
  }

  return (
    <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout}>
      <ChatOutlineTextList
        // 换一个 chat 就是另一份大纲，新实例才会重读自己的折叠状态。
        key={agentId}
        prompts={prompts}
        activeSeq={activeSeq}
        width={textRailWidth}
        agentId={agentId}
        onJumpToPrompt={onJumpToPrompt}
      />
    </View>
  );
});

const styles = StyleSheet.create(() => ({
  panelMeasure: {
    position: "absolute",
    inset: 0,
  },
}));
