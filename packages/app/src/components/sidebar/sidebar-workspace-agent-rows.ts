import {
  collectAllTabs,
  findPaneById,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export interface SidebarWorkspaceAgentRow {
  /** The layout tab this row stands for, so the menu can act on the tab and not just the agent. */
  tabId: string;
  agentId: string;
  target: WorkspaceTabTarget & { kind: "agent" };
}

/**
 * The agent tabs a workspace currently holds, in tab order.
 *
 * This is the layout's own ordering — `collectAllTabs` walks the split tree left to right, top to
 * bottom — so the sidebar list reads in the same order the tab strip does. A workspace restored
 * from disk still has its tabs here even before the route mounts, which is what makes the list
 * correct for workspaces the user has not opened in this session.
 */
export function buildSidebarWorkspaceAgentRows(
  layout: WorkspaceLayout | null | undefined,
): SidebarWorkspaceAgentRow[] {
  if (!layout) return [];
  const rows: SidebarWorkspaceAgentRow[] = [];
  for (const tab of collectAllTabs(layout.root)) {
    if (tab.target.kind !== "agent") continue;
    rows.push({ tabId: tab.tabId, agentId: tab.target.agentId, target: tab.target });
  }
  return rows;
}

/**
 * The tab the user is actually looking at in a workspace: the focused pane's focused tab. A split
 * workspace has several panes, and the sidebar list marks the one tab that is on screen, so this is
 * the pane the route focuses, not simply the first or last agent tab in the tree.
 */
export function findFocusedWorkspaceTabId(
  layout: WorkspaceLayout | null | undefined,
): string | null {
  if (!layout) return null;
  const focusedPane = findPaneById(layout.root, layout.focusedPaneId);
  return focusedPane?.focusedTabId ?? null;
}
