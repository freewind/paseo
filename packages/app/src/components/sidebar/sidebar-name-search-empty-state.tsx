import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useSidebarNameSearch } from "@/components/sidebar/sidebar-model";
import { SidebarEmptyStateCard, SidebarFilterEmptyState } from "./empty-states";

/**
 * 名称搜索没有命中。输入框在列表上方的标题头里，仍然可见；这张卡片是退出搜索的一步操作。
 */
export function SidebarNameSearchEmptyState() {
  const { t } = useTranslation();
  const setNameSearch = useSidebarViewStore((state) => state.setNameSearch);
  const clear = useCallback(() => setNameSearch(""), [setNameSearch]);

  return (
    <SidebarEmptyStateCard
      testID="sidebar-name-search-empty-state"
      title={t("sidebar.nameSearch.noMatchesTitle")}
      description={t("sidebar.nameSearch.noMatchesDescription")}
    >
      <Button variant="secondary" size="xs" onPress={clear}>
        {t("sidebar.nameSearch.clear")}
      </Button>
    </SidebarEmptyStateCard>
  );
}

/**
 * 列表被筛空的统一出口：搜索期间显示「没有匹配」，否则显示原来的筛空提示。
 * 两个列表模式共用它，空状态文案才与当前真正生效的筛选一致。
 */
export function SidebarFilteredListEmptyState() {
  const { active } = useSidebarNameSearch();
  return active ? <SidebarNameSearchEmptyState /> : <SidebarFilterEmptyState />;
}
