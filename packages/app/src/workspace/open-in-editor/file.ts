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
  projectId: string | null;
}

interface OpenFileInEditorAction {
  targetName: string;
  open: (filePath: string) => void;
}

/**
 * 把工作区里的单个文件交给首选的外部编辑器。与 `useOpenDirectoryInEditor` 同一套目标规划，
 * 只是用 `activeFile` 而不是目录，编辑器收到的是文件路径。
 *
 * 不能打开时返回 null（daemon 在远端、没有桌面桥、没有可用编辑器）：调用方照常接线，只是
 * 什么也不会发生，不需要自己判断可用性。
 */
export function useOpenFileInEditor({
  serverId,
  workspaceDirectory,
  projectId,
}: UseOpenFileInEditorInput): OpenFileInEditorAction | null {
  const { t } = useTranslation();
  const toast = useToast();
  const isLocalExecution = useIsLocalDaemon(serverId);
  const { preferredEditorId } = usePreferredEditor({ serverId, projectId });
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
          cause instanceof Error
            ? cause.message
            : t("workspace.fileExplorer.errors.openInEditorFailed"),
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
