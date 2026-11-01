import type { TFunction } from "i18next";
import type { Agent } from "@/stores/session-store";
import { resolveCloseAgentTabPolicy } from "@/subagents/close-tab-policy";
import { confirmDialog } from "@/utils/confirm-dialog";

/**
 * 关这个 tab 会不会顺手归档一个正在跑的 agent —— 只有这一种情况值得先问一句。
 *
 * 返回 true 表示可以继续关闭；不需要问时也返回 true。
 */
export async function confirmArchiveRunningAgent(input: {
  t: TFunction;
  agent: Agent | null;
}): Promise<boolean> {
  const { t, agent } = input;
  if (agent?.status !== "running") return true;
  if (resolveCloseAgentTabPolicy(agent).kind !== "archive-on-close") return true;
  return await confirmDialog({
    title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
    message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
    confirmLabel: t("workspace.tabs.confirmations.archive"),
    cancelLabel: t("workspace.tabs.confirmations.cancel"),
    destructive: true,
  });
}
