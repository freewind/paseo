import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BulkCloseConfirmationLabels } from "@/screens/workspace/workspace-bulk-close";

/**
 * 批量关闭确认弹窗的文案表，tab 栏和侧栏共用。
 *
 * `buildBulkCloseConfirmationMessage` 只认这张表；两处各拼一份，文案或分组语义改了就会漂。
 */
export function useBulkCloseConfirmationLabels(): BulkCloseConfirmationLabels {
  const { t } = useTranslation();
  return useMemo<BulkCloseConfirmationLabels>(
    () => ({
      newTab: t("workspace.tabs.actions.newTab"),
      all: ({ agents, terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.all", {
          agents,
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTerminals: ({ agents, terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTerminals", {
          agents,
          terminals: terminalCount,
        }),
      terminalsAndTabs: ({ terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.terminalsAndTabs", {
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTabs: ({ agents, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTabs", { agents, tabs: tabCount }),
      terminals: ({ terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.terminals", { terminals: terminalCount }),
      tabs: ({ tabs: tabCount }) => t("workspace.tabs.confirmations.bulk.tabs", { tabs: tabCount }),
      agents: ({ agents }) => t("workspace.tabs.confirmations.bulk.agents", { agents }),
    }),
    [t],
  );
}
