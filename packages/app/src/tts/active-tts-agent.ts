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
 * The agent the user is actually looking at, in the same terms the sidebar highlights:
 * the focused pane's focused tab, and nothing else. A pane showing files, a terminal or a diff
 * has no active agent, because "the agent I am reading" is then undefined rather than guessed.
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
 * Which agent this host's reading is allowed to follow. A dedicated agent route wins outright;
 * otherwise the active workspace's focused tab answers. Anything else — another host, no
 * workspace open, a non-agent tab — resolves to null, and a null means "stay silent".
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

/** Subscription to the active agent for one host, for gates that must follow the user's eyes. */
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
