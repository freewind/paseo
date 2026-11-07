import { useCallback } from "react";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usePanelStore } from "@/stores/panel-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { generateDraftId } from "@/stores/draft-keys";

/**
 * 侧栏工作区菜单里「新建 Agent」的点击处理。
 *
 * 在这之前，想新建 agent 只有两条路：tab 条那个「新建 Tab」面板（`new-tab.ts` 里的
 * `{ kind: "agent" }`）和 `workspace.agent.new` 快捷键。两条路都在 workspace-screen 内部，
 * 靠它自己的 `persistenceKey` 开标签。侧栏菜单渲染在 sidebar 里，手上只有 `serverId` 和
 * `workspaceId`，够不着那两条，用户想在菜单里起 agent 得先离开当前工作区。
 *
 * 所以这里改走 `navigateToWorkspace`：它接 `serverId` + `workspaceId`，先定位到目标工作区、
 * 再在那里开标签，菜单只要有这两个 id 就能起 agent，不必依赖自己被渲染在哪个屏幕里。
 */
export function useCreateWorkspaceAgent({
  serverId,
  workspaceId,
}: {
  serverId?: string;
  workspaceId?: string;
}): (() => void) | undefined {
  const isCompactLayout = useIsCompactFormFactor();
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);

  return useCallback(() => {
    if (!serverId || !workspaceId) return;
    if (isCompactLayout) showMobileAgent();
    navigateToWorkspace({
      serverId,
      workspaceId,
      // 草稿目标：只开一个标签页，标签里发出第一条消息才真正创建 agent（创建发生在
      // composer/draft/create-flow，按 draftId 发起）。这里没有任何创建调用，
      // 别以为点完菜单会话列表就多出一个 agent。
      target: {
        kind: "draft",
        // 每次都新生成 id、不复用已打开的空草稿：连点两次会得到两个草稿标签，
        // 用户看到两个标签就能确认自己点了两下，而不是怀疑菜单没反应。
        draftId: generateDraftId(),
      },
    });
  }, [isCompactLayout, serverId, showMobileAgent, workspaceId]);
}
