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

/** The worktree-archive risk fields a header archive controller passes on, derived from the
 * workspace descriptor's git runtime. Kept pure so the derivation is unit-testable. */
export function resolveArchiveWorkspaceRisk(
  workspace: WorkspaceDescriptor | null | undefined,
): { workspaceKind: WorkspaceDescriptor["workspaceKind"]; name: string; isDirty: boolean | null; aheadOfOrigin: number | null; diffStat: { additions: number; deletions: number } | null } {
  return {
    workspaceKind: workspace?.workspaceKind ?? "directory",
    name: workspace?.name ?? "",
    isDirty: workspace?.gitRuntime?.isDirty ?? null,
    aheadOfOrigin: workspace?.gitRuntime?.aheadOfOrigin ?? null,
    diffStat: workspace?.diffStat ?? null,
  };
}

/**
 * Wires the workspace archive controller to the active route's redirect: archiving the currently
 * active workspace must send the user somewhere else once it is optimistically hidden. Exposed as
 * its own hook so the header wiring (and its redirect dependency) stays out of the screen body.
 */
export function useWorkspaceHeaderArchive(input: WorkspaceHeaderArchiveInput): WorkspaceHeaderArchive {
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
