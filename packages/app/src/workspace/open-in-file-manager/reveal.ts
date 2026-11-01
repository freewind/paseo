import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";

interface UseRevealInFileManagerInput {
  serverId: string;
  workspaceDirectory: string;
}

interface RevealInFileManagerAction {
  targetName: string;
  reveal: (entryPath: string) => void;
}

/**
 * 在工作区里定位一个文件项：文件管理器高亮它而不是只打开工作区根目录（桌面端拿到
 * `filePath` 时走 showItemInFolder）。
 *
 * 没有桌面桥、daemon 在远端或工作区目录未知时返回 null；调用方照常接线，点了不会有反应。
 */
export function useRevealInFileManager({
  serverId,
  workspaceDirectory,
}: UseRevealInFileManagerInput): RevealInFileManagerAction | null {
  const { t } = useTranslation();
  const toast = useToast();
  const isLocalExecution = useIsLocalDaemon(serverId);
  const { targets } = useDesktopOpenTargets({ isLocalExecution });
  const fileManagerTarget = targets.find((target) => target.kind === "file-manager") ?? null;
  const hasWorkspaceDirectory = workspaceDirectory.trim().length > 0;

  const reveal = useCallback(
    (entryPath: string) => {
      if (!fileManagerTarget || !hasWorkspaceDirectory) {
        return;
      }
      void openDesktopTarget({
        editorId: fileManagerTarget.id,
        workspacePath: workspaceDirectory,
        filePath: buildAbsoluteExplorerPath({
          workspaceRoot: workspaceDirectory,
          entryPath,
        }),
      }).catch((cause: unknown) => {
        toast.error(
          cause instanceof Error ? cause.message : t("workspace.fileExplorer.errors.revealFailed"),
        );
      });
    },
    [fileManagerTarget, hasWorkspaceDirectory, t, toast, workspaceDirectory],
  );

  return useMemo(
    () =>
      fileManagerTarget && hasWorkspaceDirectory
        ? { targetName: fileManagerTarget.label, reveal }
        : null,
    [fileManagerTarget, hasWorkspaceDirectory, reveal],
  );
}
