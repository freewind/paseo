import type { ReactElement, ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";

function renderHeaderMenuEntry(entry: WorkspaceTabMenuEntry): ReactElement | null {
  if (entry.kind === "separator") {
    return <ContextMenuSeparator key={entry.key} />;
  }
  if (entry.kind === "file-panel-open-with") {
    return null;
  }
  return (
    <ContextMenuItem
      key={entry.key}
      onSelect={entry.onSelect}
      disabled={entry.disabled}
      destructive={entry.destructive}
      tooltip={entry.tooltip}
      testID={entry.testID}
    >
      {entry.hint ? `${entry.label}  ${entry.hint}` : entry.label}
    </ContextMenuItem>
  );
}

/**
 * 工作区头部标题的右键菜单。条目由标签菜单同一个 builder 生成，所以顺序与措辞跟
 * 标签菜单逐项一致；只渲染条目本身，不重复图标映射。
 */
export function WorkspaceHeaderContextMenu({
  menuEntries,
  testID,
  children,
}: {
  menuEntries: WorkspaceTabMenuEntry[];
  testID: string;
  children: ReactNode;
}): ReactElement {
  if (menuEntries.length === 0) {
    return children as ReactElement;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger testID={`${testID}-trigger`}>{children}</ContextMenuTrigger>
      <ContextMenuContent align="start" width={240} testID={testID}>
        {menuEntries.map((entry) => renderHeaderMenuEntry(entry))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
