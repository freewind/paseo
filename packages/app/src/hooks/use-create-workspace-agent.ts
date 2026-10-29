import { useCallback } from "react";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usePanelStore } from "@/stores/panel-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { generateDraftId } from "@/stores/draft-keys";

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
      target: { kind: "draft", draftId: generateDraftId() },
    });
  }, [isCompactLayout, serverId, showMobileAgent, workspaceId]);
}
