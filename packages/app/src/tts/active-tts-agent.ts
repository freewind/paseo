import { usePathname } from "expo-router";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { ActiveWorkspaceSelection } from "@/stores/last-workspace-selection";
import {
  collectAllTabs,
  findPaneById,
  useWorkspaceLayoutStore,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { parseHostAgentRouteFromPathname, type HostAgentRoute } from "@/utils/host-routes";

/**
 * 用户真正在看的 agent：只看聚焦面板里聚焦的标签页。显示文件、终端或 diff 的
 * 面板没有活跃 agent，「我在读哪个」此时未定义，不该靠猜。
 */
export function resolveFocusedWorkspaceAgentId(
  layout: WorkspaceLayout | null | undefined,
): string | null {
  if (!layout) {
    return null;
  }
  const focusedTabId = findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId;
  if (!focusedTabId) {
    return null;
  }
  const focusedTab = collectAllTabs(layout.root).find((tab) => tab.tabId === focusedTabId);
  return focusedTab?.target.kind === "agent" ? focusedTab.target.agentId : null;
}

/**
 * 专门的 agent 路由优先，否则由活跃工作区里聚焦的标签页决定。别的主机、
 * 没开工作区、非 agent 的标签页都解析为 null，null 表示「保持安静」。
 */
export function resolveActiveTtsAgentId(input: {
  serverId: string;
  routeAgent: HostAgentRoute | null;
  selection: ActiveWorkspaceSelection | null;
  layout: WorkspaceLayout | null | undefined;
}): string | null {
  if (input.routeAgent && input.routeAgent.serverId === input.serverId) {
    return input.routeAgent.agentId;
  }
  if (input.selection && input.selection.serverId === input.serverId) {
    return resolveFocusedWorkspaceAgentId(input.layout);
  }
  return null;
}

export function useActiveTtsAgentId(serverId: string): string | null {
  const pathname = usePathname();
  const selection = useActiveWorkspaceSelection();
  const workspaceKey = selection ? buildWorkspaceTabPersistenceKey(selection) : null;
  const layout = useWorkspaceLayoutStore((state) =>
    workspaceKey ? (state.layoutByWorkspace[workspaceKey] ?? null) : null,
  );

  return resolveActiveTtsAgentId({
    serverId,
    routeAgent: parseHostAgentRouteFromPathname(pathname ?? ""),
    selection,
    layout,
  });
}
