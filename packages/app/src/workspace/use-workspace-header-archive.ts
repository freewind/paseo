import { useCallback, useState } from "react";
import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";

export interface WorkspaceHeaderArchiveInput {
  serverId: string;
  workspaceId: string;
  workspace: WorkspaceDescriptor | null | undefined;
}

export interface WorkspaceHeaderArchive {
  archive: () => void;
  isArchiving: boolean;
}

/** 从工作区描述的 git 运行时推导，保持纯函数好测。 */
export function resolveArchiveWorkspaceRisk(workspace: WorkspaceDescriptor | null | undefined): {
  workspaceKind: WorkspaceDescriptor["workspaceKind"];
  name: string;
  isDirty: boolean | null;
  aheadOfOrigin: number | null;
  diffStat: { additions: number; deletions: number } | null;
} {
  return {
    workspaceKind: workspace?.workspaceKind ?? "directory",
    name: workspace?.name ?? "",
    isDirty: workspace?.gitRuntime?.isDirty ?? null,
    aheadOfOrigin: workspace?.gitRuntime?.aheadOfOrigin ?? null,
    diffStat: workspace?.diffStat ?? null,
  };
}

/**
 * 归档当前活跃工作区时，它一被乐观隐藏就得把用户送去别处。单独成 hook，
 * 免得跳转依赖挤进页面主体。
 */
export function useWorkspaceHeaderArchive(
  input: WorkspaceHeaderArchiveInput,
): WorkspaceHeaderArchive {
  const { serverId, workspaceId, workspace } = input;
  const activeWorkspaceSelection: ActiveWorkspaceSelection | null = useActiveWorkspaceSelection();
  const [isHidingWorkspace, setIsHidingWorkspace] = useState(false);

  const handleArchiveStarted = useCallback(() => {
    redirectIfArchivingActiveWorkspace({
      serverId,
      workspaceId,
      activeWorkspaceSelection,
    });
  }, [activeWorkspaceSelection, serverId, workspaceId]);

  const risk = resolveArchiveWorkspaceRisk(workspace);
  const archiveController = useWorkspaceArchive({
    serverId,
    workspaceId,
    ...risk,
    onArchiveStarted: handleArchiveStarted,
    onSetHiding: setIsHidingWorkspace,
  });

  const isArchiving = (workspace?.archivingAt ?? null) !== null || isHidingWorkspace;
  const archive = useCallback(() => {
    if (isArchiving) return;
    archiveController.archive();
  }, [archiveController, isArchiving]);

  return { archive, isArchiving };
}
