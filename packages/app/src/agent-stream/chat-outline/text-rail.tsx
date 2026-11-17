import { memo, useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { List } from "lucide-react-native";
import { SheetHeaderView } from "@/components/adaptive-modal-sheet";
import { PressHighlight } from "@/components/ui/press-highlight";
import {
  IsolatedBottomSheetModal,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import type { ActivePromptSource, ChatOutlinePrompt } from "./model";
import { ChatOutlineTextTimeline } from "./text-timeline";

export interface ChatOutlineTextRailProps {
  prompts: readonly ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  onJumpToPrompt: (seq: number) => void;
  contentMaxWidth: number;
  agentId: string;
}

const ThemedBottomSheetModal = withUnistyles(IsolatedBottomSheetModal, (theme) => ({
  backgroundStyle: {
    backgroundColor: theme.colors.surface0,
    borderTopLeftRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius["2xl"],
  },
  handleIndicatorStyle: { backgroundColor: theme.colors.palette.zinc[600] },
}));

const ThemedListIcon = withUnistyles(List, (theme) => ({ color: theme.colors.foregroundMuted }));

/** 抽屉里的内边距，宽度要扣掉它，列表才不会横向溢出。 */
const SHEET_PADDING = 16;

/**
 * 手机上屏幕两侧没有缝给常驻大纲，所以收成输入区上方的一个按钮：
 * 点开抽屉再选，条目与 web 那份是同一个列表，第一条同样固定在顶部。
 */
export const ChatOutlineTextRail = memo(function ChatOutlineTextRail({
  prompts,
  activePrompt,
  onJumpToPrompt,
  agentId,
}: ChatOutlineTextRailProps) {
  const { t } = useTranslation();
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const [open, setOpen] = useState(false);
  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const { sheetRef, handleSheetChange, handleSheetDismiss } = useIsolatedBottomSheetVisibility({
    visible: open,
    onClose: handleClose,
  });
  const header = useMemo(() => ({ title: t("agentStream.chatOutline.title") }), [t]);
  const handleJump = useCallback(
    (seq: number) => {
      onJumpToPrompt(seq);
      setOpen(false);
    },
    [onJumpToPrompt],
  );

  if (prompts.length === 0) return null;

  return (
    <>
      <PressHighlight
        style={styles.trigger}
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={t("agentStream.chatOutline.open")}
        testID="chat-outline-open"
      >
        <ThemedListIcon size={18} />
      </PressHighlight>
      <ThemedBottomSheetModal
        ref={sheetRef}
        contextBridge={null}
        enableDynamicSizing={false}
        snapPoints={["60%"]}
        onChange={handleSheetChange}
        onDismiss={handleSheetDismiss}
        backdropOpacity={0.45}
        enablePanDownToClose
      >
        <View style={styles.sheetBody} role="dialog" aria-label={header.title}>
          <SheetHeaderView header={header} onClose={handleClose} />
          <ChatOutlineTextTimeline
            key={agentId}
            prompts={prompts}
            activeSeq={activeSeq}
            onSelectPrompt={handleJump}
          />
        </View>
      </ThemedBottomSheetModal>
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  sheetBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: SHEET_PADDING,
  },
  // 贴在输入区上方右侧，避开面板底部的其它按钮。
  trigger: {
    position: "absolute",
    right: theme.spacing[3],
    bottom: theme.spacing[3],
    zIndex: 3,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface1,
  },
}));
