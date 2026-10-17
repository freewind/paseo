import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { SidebarEmptyStateCard } from "./empty-states";

/**
 * The name search matched nothing. The field itself lives in the section header
 * above the list, so it stays mounted; this card is the one-click way out.
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
