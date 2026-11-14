import { ArrowLeft, ArrowRight } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type AccessibilityState } from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { SidebarRowIcon } from "@/components/sidebar/sidebar-header-row";
import { SidebarRecentVisitsMenu } from "@/components/sidebar/sidebar-recent-visits-menu";
import { useRouteBack } from "@/hooks/use-route-back";
import { density } from "@/styles/density";
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
 * 忽现。历史只含独立 agent 的 chat（见 useRouteBack）：文件、终端、设置页、空白 tab
 * 都不占一步，在这些页面上按返回直接回到上一个 agent chat。最近访问是另一份独立
 * 记录（见 SidebarRecentVisitsMenu）。
 *
 * 这一行不进 `disableUncommonFeatures` 的隐藏清单：那个开关管的是低频入口，而二级页没有别的
 * 退出按钮，藏掉后用户会困在页面里。
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

  // 与侧栏头部其它行同一套排布：最近访问占满剩余宽度，返回/前进在右。

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
 * 两个方向控件之一，与侧栏其它行共用同一套行几何。悬停挂在普通 `View` 上，
 * 按压交给内层 `PressHighlight`——见 [docs/hover.md](../../../../docs/hover.md)
 * ——悬停只变颜色，不改控件盒子。
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
      <PressHighlight
        onPress={onPress}
        disabled={disabled}
        testID={testID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={disabled ? DISABLED_ACCESSIBILITY_STATE : undefined}
        aria-disabled={disabled}
        style={styles.controlButton}
        highlightStyle={styles.controlHighlighted}
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
      </PressHighlight>
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
    // 顶部留白属于这一行本身：调用点不再包容器，模式关闭时这一行整个不存在。
    paddingTop: theme.spacing[2],
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
    minHeight: density.tightRowHeight,
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
