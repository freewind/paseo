import { memo, useCallback } from "react";
import { FileHeader } from "@/git/file-header";
import type { DiffFileSection } from "./types";
import type { DiffDocumentProps } from "./types";

interface DocumentFileHeaderProps {
  file: DiffFileSection;
  selectedPath: string | null;
  mode: DiffDocumentProps["mode"];
  onToggleFile: (path: string) => void;
  onSelectPath: (path: string) => void;
  canvasRendered?: boolean;
  onActiveChange?: (active: boolean) => void;
  wrapToggle?: { wrapped: boolean; onToggle: () => void };
}

export const DocumentFileHeader = memo(function DocumentFileHeader({
  file,
  selectedPath,
  mode,
  onToggleFile,
  onSelectPath,
  canvasRendered = false,
  onActiveChange,
  wrapToggle,
}: DocumentFileHeaderProps) {
  const activate = useCallback(
    (path: string) => {
      if (mode.kind !== "working") return;
      mode.onFilePress?.(path);
      onToggleFile(path);
    },
    [mode, onToggleFile],
  );
  const working = mode.kind === "working" ? mode : null;
  return (
    <FileHeader
      file={file.file}
      bodyVisible={!file.isCollapsed}
      isSelected={selectedPath === file.path}
      interactive={mode.kind === "working"}
      workspaceFileDragScope={working?.workspaceFileDragScope}
      onActivate={activate}
      onSelect={onSelectPath}
      onOpenFile={working?.onOpenFile}
      onOpenToSide={working?.onOpenToSide}
      onAddToChat={working?.onAddToChat}
      onCopyPath={working?.onCopyPath}
      onCopyRelativePath={working?.onCopyRelativePath}
      onReveal={working?.onReveal}
      revealTargetName={working?.revealTargetName}
      onDownload={working?.onDownload}
      onDuplicate={working?.onDuplicate}
      onRevert={working?.onRevert}
      testID={`diff-file-${file.fileIndex}`}
      canvasRendered={canvasRendered}
      onActiveChange={onActiveChange}
      wrapToggle={wrapToggle}
    />
  );
}, documentFileHeaderPropsEqual);

function documentFileHeaderPropsEqual(
  previous: DocumentFileHeaderProps,
  next: DocumentFileHeaderProps,
): boolean {
  if (!documentFileHeaderIdentityMatches(previous, next)) return false;
  if (previous.mode.kind === "commit" || next.mode.kind === "commit") return true;
  const previousWrap = previous.wrapToggle;
  const nextWrap = next.wrapToggle;
  if (previousWrap === undefined || nextWrap === undefined) {
    return previousWrap === nextWrap;
  }
  if (previousWrap.wrapped !== nextWrap.wrapped) return false;
  return previousWrap.onToggle === nextWrap.onToggle;
}

function documentFileHeaderIdentityMatches(
  previous: DocumentFileHeaderProps,
  next: DocumentFileHeaderProps,
): boolean {
  return !(
    previous.file.file !== next.file.file ||
    previous.file.fileIndex !== next.file.fileIndex ||
    previous.file.isCollapsed !== next.file.isCollapsed ||
    (previous.selectedPath === previous.file.path) !== (next.selectedPath === next.file.path) ||
    previous.onToggleFile !== next.onToggleFile ||
    previous.onSelectPath !== next.onSelectPath ||
    previous.canvasRendered !== next.canvasRendered ||
    previous.onActiveChange !== next.onActiveChange ||
    previous.mode.kind !== next.mode.kind
  );
}
