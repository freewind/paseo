import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { getOpenAgentTabLabel } from "@getpaseo/protocol/agent-labels";
import { i18n } from "@/i18n/i18next";
import { useSessionStore } from "@/stores/session-store";
import { resolveCloseAgentTabPolicy } from "@/subagents/close-tab-policy";
import { getOrCreateClientId } from "@/utils/client-id";

/**
 * 把 agent 从「已打开的 tab」这个标签上摘下来。
 *
 * 只做这一步：单关要关完 tab 才归档，批量关闭由 `closeBulkWorkspaceTabs` 定顺序，在这里顺手
 * 归档会让两处都变成「先归档、后关 tab」。
 */
export async function detachAgentFromOpenTabs(input: {
  client: DaemonClient | null;
  agentId: string;
}): Promise<void> {
  const { client, agentId } = input;
  if (!client) {
    throw new Error(i18n.t("common.errors.daemonClientUnavailable"));
  }
  const clientId = await getOrCreateClientId();
  await client.updateAgent(agentId, { labels: { [getOpenAgentTabLabel(clientId)]: "false" } });
}

/**
 * 关闭一个 layout-only 的 subagent tab：摘标签，再读一次最新 agent 重判策略 —— 摘标签期间
 * daemon 那边可能已经变了，照旧判断会归档错对象。
 */
export async function closeLayoutOnlyAgent(input: {
  serverId: string;
  client: DaemonClient | null;
  archiveAgent: (input: { serverId: string; agentId: string }) => Promise<void>;
  agentId: string;
}): Promise<void> {
  const { serverId, client, archiveAgent, agentId } = input;
  await detachAgentFromOpenTabs({ client, agentId });
  const latestAgent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
  if (resolveCloseAgentTabPolicy(latestAgent).kind === "archive-on-close") {
    await archiveAgent({ serverId, agentId });
  }
}
