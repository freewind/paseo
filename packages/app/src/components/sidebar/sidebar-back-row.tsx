import { ArrowLeft } from "lucide-react-native";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { useRouteBack } from "@/hooks/use-route-back";

interface SidebarBackRowProps {
  onBeforeNavigate?: () => void;
}

/**
 * 常驻的返回入口。从 Chat 打开的二级页本身没有退出按钮，把返回固定放在侧栏
 * 顶部，用户在任何页面都能一眼找到；没有历史时保留行并置灰，避免入口忽隐忽现。
 */
export function SidebarBackRow({ onBeforeNavigate }: SidebarBackRowProps) {
  const { t } = useTranslation();
  const { canGoBack, goBack } = useRouteBack();

  const handlePress = useCallback(() => {
    // 没有可返回的历史时不止是禁用样式，点击也必须无副作用。
    if (!canGoBack) {
      return;
    }
    // 与侧栏其它导航行一致：先收起侧栏，再执行导航。
    onBeforeNavigate?.();
    goBack();
  }, [canGoBack, goBack, onBeforeNavigate]);

  return (
    <SidebarHeaderRow
      icon={ArrowLeft}
      label={t("common.actions.back")}
      onPress={handlePress}
      testID="sidebar-back"
      variant="compact"
      disabled={!canGoBack}
    />
  );
}
