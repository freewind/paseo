import {
  collectAllTabs,
  findPaneById,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export interface SidebarWorkspaceAgentRow {
  /** 这一行代表的 layout tab，菜单才能作用于 tab 而不只是 agent。 */
  tabId: string;
  agentId: string;
  target: WorkspaceTabTarget & { kind: "agent" };
  /** agent 最后一次活动的时间；取不到时为 null，行尾就不画时间。 */
  lastActivityAt: Date | null;
}

/** agent 行显示的标签：未命名 agent 回退到它的 id，标题不会空着。 */
export function agentTabLabel(title: string | null | undefined, fallback: string): string {
  const normalized = typeof title === "string" ? title.trim() : "";
  // daemon 给未命名 agent 的初始标题是 "New agent"，它只是占位符，不是名字。
  return !normalized || normalized.toLowerCase() === "new agent" ? fallback : normalized;
}

/**
 * workspace 当前持有的 agent tab，按 tab 顺序。
 *
 * 这是 layout 自己的顺序 —— `collectAllTabs` 从左到右、从上到下遍历分屏树 —— 所以 sidebar
 * 列表和 tab 栏读到的顺序一致。从磁盘恢复的 workspace 在路由挂载之前也已经在这里有 tab，
 * 因此用户本次会话没打开过的 workspace 也能列对。
 */
export function buildSidebarWorkspaceAgentRows(
  layout: WorkspaceLayout | null | undefined,
  readLastActivity: (agentId: string) => Date | null = () => null,
): SidebarWorkspaceAgentRow[] {
  if (!layout) return [];
  const rows: SidebarWorkspaceAgentRow[] = [];
  for (const tab of collectAllTabs(layout.root)) {
    if (tab.target.kind !== "agent") continue;
    rows.push({
      tabId: tab.tabId,
      agentId: tab.target.agentId,
      target: tab.target,
      lastActivityAt: readLastActivity(tab.target.agentId),
    });
  }
  return rows;
}

/**
 * 用户在一个 workspace 里真正在看的那一个 tab：聚焦 pane 的聚焦 tab。分屏 workspace 有多个
 * pane，而 sidebar 列表只标出屏幕上那一个 tab，所以这里取路由聚焦的 pane，而不是树里第一个
 * 或最后一个 agent tab。
 */
export function findFocusedWorkspaceTabId(
  layout: WorkspaceLayout | null | undefined,
): string | null {
  if (!layout) return null;
  const focusedPane = findPaneById(layout.root, layout.focusedPaneId);
  return focusedPane?.focusedTabId ?? null;
}
