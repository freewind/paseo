import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { resolvePreferredEditorId, usePreferredEditor } from "@/hooks/use-preferred-editor";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";
import { planWorkspaceOpenTargets } from "@/workspace/open-in-editor/planner";

interface UseOpenFileInEditorInput {
  serverId: string;
  workspaceDirectory: string;
}

interface OpenFileInEditorAction {
  targetName: string;
  open: (filePath: string) => void;
}

/**
 * Open one workspace file in the user's preferred desktop editor. Mirrors
 * `useOpenDirectoryInEditor` but plans with `activeFile` so the editor receives the
 * file path. Null when no editor target is available (remote daemon or no bridge).
 */
export function useOpenFileInEditor({
  serverId,
  workspaceDirectory,
}: UseOpenFileInEditorInput): OpenFileInEditorAction | null {
  const { t } = useTranslation();
  const toast = useToast();
  const isLocalExecution = useIsLocalDaemon(serverId);
  const { preferredEditorId } = usePreferredEditor();
  const { targets, isAvailable } = useDesktopOpenTargets({ isLocalExecution });
  const editorTargets = useMemo(
    () => targets.filter((target) => target.kind === "editor"),
    [targets],
  );
  const preferredTarget = useMemo(() => {
    const preferredId = resolvePreferredEditorId(
      editorTargets.map((target) => target.id),
      preferredEditorId,
    );
    return editorTargets.find((target) => target.id === preferredId) ?? null;
  }, [editorTargets, preferredEditorId]);

  const open = useCallback(
    (filePath: string) => {
      if (!preferredTarget) {
        return;
      }
      const target = planWorkspaceOpenTargets({
        workspaceDirectory,
        activeFile: { path: filePath },
        desktopTargets: [preferredTarget],
        canUseDesktopBridge: isAvailable,
        isLocalExecution,
      }).find((candidate) => candidate.source === "desktop");
      if (!target) {
        return;
      }
      void openDesktopTarget(target.openInput).catch((cause: unknown) => {
        toast.error(
          cause instanceof Error ? cause.message : t("workspace.openFileInEditor.failed"),
        );
      });
    },
    [isAvailable, isLocalExecution, preferredTarget, t, toast, workspaceDirectory],
  );

  return useMemo(
    () => (preferredTarget ? { targetName: preferredTarget.label, open } : null),
    [open, preferredTarget],
  );
}
