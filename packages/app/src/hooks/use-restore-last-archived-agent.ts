import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { fetchAgentHistoryPage, type AgentHistoryClient } from "@/hooks/use-agent-history";
import { queryClient } from "@/data/query-client";
import { useFetchQuery } from "@/data/query";

/**
 * 归档是全局软删除：agent 从各处的活跃列表消失，只留在会话列表里带着「已归档」标记。
 * 误点「归档」之后要恢复，用户原本得自己翻到那一条再点 Unarchive；这个入口把最近归档的那一个
 * 就地捞回来，省掉找列表那一步。所以它是误归档的补救路径，不是归档功能的补充操作。
 *
 * 恢复某个工作区里最近归档的那一个 agent：先按 id 打开（归档态即可见，同从历史列表
 * 点开归档 agent），再解档，避免等恢复完成才看到反应。没有可恢复的对象时返回 null，
 * 调用方据此不渲染菜单项，而不是渲染一个点了只会弹提示的空操作。
 *
 * 归档状态有两个来源。本地 agents map 只在「本会话内刚归档」时还留着归档 agent：目录同步
 * 只拉活跃 agent（scope: "active"），且 replaceFetched 会用拉取结果整表替换。跨重启的可靠
 * 来源是历史列表：它带 archivedAt，且归档发生时历史缓存已被同步更新。两个来源取归档时间
 * 较新者，菜单项才不会在重启后消失。
 *
 * 历史拉取按 serverId 共享一个查询：侧栏任意行的菜单都会挂载这个 hook，按 workspaceId
 * 各拉一份会放大成 N 个请求；每主机一页 200 条与打开一次历史界面同开销。
 */

const LATEST_ARCHIVED_STALE_MS = 5 * 60_000;

interface LatestArchivedAgent {
  agentId: string;
  archivedAt: Date;
}

/** 每个工作区里归档时间最新的那一条。 */
type LatestArchivedByWorkspace = Map<string, LatestArchivedAgent>;

function latestArchivedQueryKey(serverId: string) {
  return ["latestArchivedAgent", serverId] as const;
}

async function fetchLatestArchivedByWorkspace(input: {
  serverId: string;
  client: AgentHistoryClient;
}): Promise<LatestArchivedByWorkspace> {
  const page = await fetchAgentHistoryPage({
    client: input.client,
    serverId: input.serverId,
    cursor: null,
  });
  const latest: LatestArchivedByWorkspace = new Map();
  for (const agent of page.agents) {
    if (!agent.workspaceId || !agent.archivedAt) continue;
    const previous = latest.get(agent.workspaceId);
    if (!previous || agent.archivedAt.getTime() > previous.archivedAt.getTime()) {
      latest.set(agent.workspaceId, { agentId: agent.id, archivedAt: agent.archivedAt });
    }
  }
  return latest;
}

function pickLatestArchivedId(
  fromMap: Agent | null,
  fromHistory: LatestArchivedAgent | null,
): string | null {
  if (!fromMap) return fromHistory?.agentId ?? null;
  if (!fromHistory) return fromMap.id;
  const mapArchivedAt = fromMap.archivedAt?.getTime() ?? 0;
  return fromHistory.archivedAt.getTime() > mapArchivedAt ? fromHistory.agentId : fromMap.id;
}

export function useRestoreLastArchivedAgent(input: {
  serverId: string | null | undefined;
  workspaceId: string | null | undefined;
}): (() => void) | null {
  const { t } = useTranslation();
  const toast = useToast();
  const serverId = input.serverId ?? "";
  const workspaceId = input.workspaceId ?? "";

  // 只订阅本工作区最新的一条归档：agent map 变化时重新求值，但不把整张表带进渲染。
  const localLatest = useSessionStore((state) =>
    serverId && workspaceId
      ? findLatestArchivedAgent({ agents: state.sessions[serverId]?.agents, workspaceId })
      : null,
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);

  const historyQuery = useFetchQuery({
    queryKey: latestArchivedQueryKey(serverId),
    queryFn: () => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      return fetchLatestArchivedByWorkspace({ serverId, client });
    },
    enabled: Boolean(serverId && client),
    dataShape: "value",
    staleTimeMs: LATEST_ARCHIVED_STALE_MS,
  });
  const historyLatest = workspaceId ? (historyQuery.data?.get(workspaceId) ?? null) : null;
  const latestArchivedAgentId = pickLatestArchivedId(localLatest, historyLatest);

  const restore = useCallback(() => {
    if (!serverId || !workspaceId) {
      return;
    }
    // 点击时重新取一遍：菜单打开期间归档状态可能已经变了。
    const mapLatest = findLatestArchivedAgent({
      agents: useSessionStore.getState().sessions[serverId]?.agents,
      workspaceId,
    });
    const cachedHistory =
      queryClient.getQueryData<LatestArchivedByWorkspace>(latestArchivedQueryKey(serverId)) ?? null;
    const latestAgentId = pickLatestArchivedId(mapLatest, cachedHistory?.get(workspaceId) ?? null);
    if (!latestAgentId) {
      toast.error(t("sidebar.workspace.toasts.noArchivedAgent"));
      return;
    }
    const clickClient = getHostRuntimeStore().getClient(serverId);
    if (!clickClient) {
      toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
      return;
    }
    void (async () => {
      // 先打开标签：id 恢复后不变，归档态也能打开；页面会先显示归档 callout，
      // 下面的解档完成后 callout 自动消失。
      navigateToWorkspace({
        serverId,
        workspaceId,
        target: { kind: "agent", agentId: latestAgentId },
      });
      try {
        await clickClient.refreshAgent(latestAgentId);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("sidebar.workspace.toasts.restoreArchivedAgentFailed"),
        );
      }
    })();
  }, [serverId, workspaceId, t, toast]);

  return useMemo(() => (latestArchivedAgentId ? restore : null), [latestArchivedAgentId, restore]);
}

export function findLatestArchivedAgent(input: {
  agents: Map<string, Agent> | undefined;
  workspaceId: string;
}): Agent | null {
  let latest: Agent | null = null;
  let latestArchivedAt = 0;
  for (const agent of input.agents?.values() ?? []) {
    if (agent.workspaceId !== input.workspaceId) {
      continue;
    }
    const archivedAt = agent.archivedAt?.getTime() ?? 0;
    if (archivedAt > latestArchivedAt) {
      latest = agent;
      latestArchivedAt = archivedAt;
    }
  }
  return latest;
}
