/**
 * 关掉一个 agent tab 时 layout 侧要一起收的三样：pin、hidden 标记、tab 本身。
 *
 * `layout` 按结构接收，不 import store 的类型：这三个动作是唯一依赖，调用方怎么拿到它们与这里无关。
 * 只适用于 agent tab —— browser tab 还要清 webview 与桌面端注册，那一段留在 workspace-screen。
 */
export function removeAgentTabWithLayoutCleanup(input: {
  layout: {
    unpinAgent: (workspaceKey: string, agentId: string) => void;
    hideAgent: (workspaceKey: string, agentId: string) => void;
    closeTab: (workspaceKey: string, tabId: string) => void;
  };
  workspaceKey: string | null;
  tabId: string;
  agentId: string;
}): void {
  const { layout, workspaceKey, tabId, agentId } = input;
  if (!workspaceKey) return;
  layout.unpinAgent(workspaceKey, agentId);
  layout.hideAgent(workspaceKey, agentId);
  layout.closeTab(workspaceKey, tabId);
}
