import { ArrowLeft, ArrowRight } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type AccessibilityState } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { SidebarRowIcon } from "@/components/sidebar/sidebar-header-row";
import { SidebarRecentVisitsMenu } from "@/components/sidebar/sidebar-recent-visits-menu";
import { useRouteBack } from "@/hooks/use-route-back";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundExtraMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});
const DISABLED_ACCESSIBILITY_STATE: AccessibilityState = { disabled: true };

interface SidebarBackRowProps {
  onBeforeNavigate?: () => void;
}

/**
 * 侧栏顶部常驻的一行导航：最近访问 + 返回 + 前进。从 Chat 打开的二级页本身没有
 * 退出按钮，把返回/前进固定在这里；没有可跳历史时保留控件并置灰，避免入口忽隐
 * 忽现。历史只含主 agent chat（见 useRouteBack）：文件、终端、设置页、空白 tab
 * 都不占一步，在这些页面上按返回直接回到上一个 agent chat。最近访问是另一份独立
 * 记录（见 SidebarRecentVisitsMenu）。
 */
export function SidebarBackRow({ onBeforeNavigate }: SidebarBackRowProps) {
  const { t } = useTranslation();
  const { canGoBack, goBack, canGoForward, goForward } = useRouteBack();

  const handleBack = useCallback(() => {
    // 没有可返回的历史时不止是禁用样式，点击也必须无副作用。
    if (!canGoBack) {
      return;
    }
    // 与侧栏其它导航行一致：先收起侧栏，再执行导航。
    onBeforeNavigate?.();
    goBack();
  }, [canGoBack, goBack, onBeforeNavigate]);

  const handleForward = useCallback(() => {
    if (!canGoForward) {
      return;
    }
    onBeforeNavigate?.();
    goForward();
  }, [canGoForward, goForward, onBeforeNavigate]);

  return (
    <View style={styles.row}>
      <SidebarRecentVisitsMenu onBeforeNavigate={onBeforeNavigate} />
      <SidebarNavigationControl
        icon={ArrowLeft}
        label={t("common.actions.back")}
        onPress={handleBack}
        disabled={!canGoBack}
        testID="sidebar-back"
      />
      <SidebarNavigationControl
        icon={ArrowRight}
        label={t("common.actions.forward")}
        onPress={handleForward}
        disabled={!canGoForward}
        testID="sidebar-forward"
      />
    </View>
  );
}

interface SidebarNavigationControlProps {
  icon: SidebarRowIcon;
  label: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}

/**
 * One of the two direction controls, on the same row geometry as the sidebar's
 * other rows. Hover lives on the plain `View` and press on a separate inner
 * `Pressable` — see [docs/hover.md](../../../../docs/hover.md) — and the hovered
 * state only changes colors, never the control's box.
 */
function SidebarNavigationControl({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: SidebarNavigationControlProps) {
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const ThemedIcon = useMemo(() => withUnistyles(icon), [icon]);
  const isHighlighted = !disabled && isHovered;

  return (
    <View
      style={[styles.control, isHighlighted && styles.controlHighlighted]}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={disabled ? DISABLED_ACCESSIBILITY_STATE : undefined}
        aria-disabled={disabled}
        style={styles.controlButton}
      >
        <ThemedIcon size={ICON_SIZE.sm} uniProps={getIconColorMapping(isHighlighted, disabled)} />
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            isHighlighted && styles.labelHighlighted,
            disabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function getIconColorMapping(isHighlighted: boolean, disabled: boolean) {
  if (disabled) {
    return foregroundExtraMutedColorMapping;
  }
  return isHighlighted ? foregroundColorMapping : foregroundMutedColorMapping;
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    // 三个控件必须停在一行里：纵向换行会把侧栏顶部撑高，也让最近访问失去位置。
    flexWrap: "nowrap",
    userSelect: "none",
  },
  control: {
    flexShrink: 0,
    borderRadius: theme.borderRadius.lg,
  },
  controlHighlighted: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  controlButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minHeight: 28,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  label: {
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    color: theme.colors.foreground,
  },
  labelDisabled: {
    color: theme.colors.foregroundExtraMuted,
  },
}));
