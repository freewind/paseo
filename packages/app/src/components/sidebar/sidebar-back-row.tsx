import { ArrowLeft, ArrowRight } from "lucide-react-native";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { useRouteBack } from "@/hooks/use-route-back";

interface SidebarBackRowProps {
  onBeforeNavigate?: () => void;
}

/**
 * 常驻的历史导航入口：返回 + 前进。从 Chat 打开的二级页本身没有退出按钮，
 * 把它们固定在侧栏顶部；没有可跳历史时保留行并置灰，避免入口忽隐忽现。
 * 历史同时覆盖页面跳转和 workspace 内的 Chat 切换（见 useRouteBack）。
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
    <>
      <SidebarHeaderRow
        icon={ArrowLeft}
        label={t("common.actions.back")}
        onPress={handleBack}
        testID="sidebar-back"
        variant="compact"
        disabled={!canGoBack}
      />
      <SidebarHeaderRow
        icon={ArrowRight}
        label={t("common.actions.forward")}
        onPress={handleForward}
        testID="sidebar-forward"
        variant="compact"
        disabled={!canGoForward}
      />
    </>
  );
}
