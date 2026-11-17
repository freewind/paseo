import { memo, useCallback, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useContainerWidth } from "@/hooks/use-container-width";
import { useIsCompactFormFactor } from "@/constants/layout";
import { shouldShowQuickRepliesRail } from "@/quick-replies/layout";
import { resolveSideRailWidth } from "./text-rail-model";
import type { ChatOutlineTextRailProps } from "./text-rail";
import { ChatOutlineTextTimeline } from "./text-timeline";

/** 折叠是阅读决定，不进设置页；换一个 chat 由 key 重挂载，状态跟着重置。 */
const collapsedAgents = new Set<string>();

export const ChatOutlineTextRail = memo(function ChatOutlineTextRail({
  prompts,
  activePrompt,
  onJumpToPrompt,
  contentMaxWidth,
  agentId,
}: ChatOutlineTextRailProps) {
  const { t } = useTranslation();
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const { onLayout, width: panelWidth } = useContainerWidth();
  const compact = useIsCompactFormFactor();
  const [isCollapsed, setIsCollapsed] = useState(() => collapsedAgents.has(agentId));
  const handleToggleCollapsed = useCallback(() => {
    setIsCollapsed((current) => {
      if (current) collapsedAgents.delete(agentId);
      else collapsedAgents.add(agentId);
      return !current;
    });
  }, [agentId]);

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
        <View style={[styles.rail, { width: textRailWidth }]}>
          <View style={styles.header}>
            <Button
              variant="secondary"
              size="xs"
              leftIcon={isCollapsed ? ChevronDown : ChevronUp}
              onPress={handleToggleCollapsed}
              accessibilityLabel={t(
                isCollapsed ? "agentStream.chatOutline.expand" : "agentStream.chatOutline.collapse",
              )}
              testID="chat-outline-text-toggle"
            />
          </View>
          {isCollapsed ? null : (
            <ChatOutlineTextTimeline
              key={agentId}
              prompts={prompts}
              activeSeq={activeSeq}
              onSelectPrompt={onJumpToPrompt}
            />
          )}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  panelMeasure: {
    position: "absolute",
    inset: 0,
  },
  rail: {
    position: "absolute",
    left: theme.spacing[2],
    top: "10%",
    bottom: "10%",
    zIndex: 2,
  },
  header: {
    alignItems: "flex-end",
  },
}));
