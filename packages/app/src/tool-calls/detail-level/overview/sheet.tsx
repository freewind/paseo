import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetScrollView, type BottomSheetScrollViewMethods } from "@gorhom/bottom-sheet";
import { Wrench, X } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  type ContextBridge,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import { ToolCallSheetModal, useToolCallSheetContextBridge } from "@/components/tool-call-sheet";
import { RetainedPanelGate } from "@/components/retained-panel";
import { useToolCallExpansionContextBridge } from "@/tool-calls/expansion-context";
import type { Theme } from "@/styles/theme";

interface OverviewToolCallGroupSheetProps {
  visible: boolean;
  summary: string;
  children: ReactNode;
  onClose: () => void;
}

const SNAP_POINTS = ["60%", "95%"];
const ThemedWrench = withUnistyles(Wrench);
const ThemedX = withUnistyles(X);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function OverviewToolCallGroupSheet({
  visible,
  summary,
  children,
  onClose,
}: OverviewToolCallGroupSheetProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const sheetContextBridge = useToolCallSheetContextBridge();
  const expansionContextBridge = useToolCallExpansionContextBridge();
  const contextBridge = useCallback<ContextBridge>(
    (content) => sheetContextBridge(expansionContextBridge(content)),
    [expansionContextBridge, sheetContextBridge],
  );
  const { sheetRef, handleSheetChange, handleSheetDismiss } = useIsolatedBottomSheetVisibility({
    visible,
    onClose,
  });

  const scrollToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, []);
  useEffect(() => {
    if (!visible) {
      return;
    }
    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [children, scrollToLatest, visible]);

  return (
    // 分组详情打开时是一张走全局 sheet 栈的 sheet，而它是在聊天面板里打开的。面板失活时
    // 直接把 surface 抽掉，别让遮罩留在目标页；展开状态由聊天那边在失活提交里收起。
    <RetainedPanelGate>
      <ToolCallSheetModal
        ref={sheetRef}
        contextBridge={contextBridge}
        snapPoints={SNAP_POINTS}
        index={0}
        enableDynamicSizing={false}
        onChange={handleSheetChange}
        onDismiss={handleSheetDismiss}
        backdropOpacity={0.5}
        enablePanDownToClose
      >
        <View style={styles.container} testID="tool-call-group-sheet">
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <ThemedWrench size={20} uniProps={foregroundMapping} />
              <Text
                style={styles.headerTitle}
                numberOfLines={2}
                testID="tool-call-group-sheet-summary"
              >
                {summary}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t("common.actions.close")}
              testID="tool-call-group-sheet-close"
            >
              <ThemedX size={20} uniProps={foregroundMutedMapping} />
            </Pressable>
          </View>
          <BottomSheetScrollView ref={scrollRef} style={styles.content}>
            <View style={styles.contentContainer}>{children}</View>
          </BottomSheetScrollView>
        </View>
      </ToolCallSheetModal>
    </RetainedPanelGate>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
    flex: 1,
  },
  closeButton: {
    padding: theme.spacing[2],
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface2,
  },
  contentContainer: {
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
}));
