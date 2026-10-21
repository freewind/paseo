import { type ReactElement, type ReactNode } from "react";
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Copy,
  CopyX,
  Circle,
  EyeOff,
  FolderInput,
  Pencil,
  RotateCw,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const ThemedCopy = withUnistyles(Copy, mutedColorMapping);
const ThemedRotateCw = withUnistyles(RotateCw, mutedColorMapping);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine, mutedColorMapping);
const ThemedArrowRightToLine = withUnistyles(ArrowRightToLine, mutedColorMapping);
const ThemedCopyX = withUnistyles(CopyX, mutedColorMapping);
const ThemedEyeOff = withUnistyles(EyeOff, mutedColorMapping);
const ThemedCircle = withUnistyles(Circle, mutedColorMapping);
const ThemedPencil = withUnistyles(Pencil, mutedColorMapping);
const ThemedFolderInput = withUnistyles(FolderInput, mutedColorMapping);
const ThemedX = withUnistyles(X, mutedColorMapping);

type EntryIcon = Extract<WorkspaceTabMenuEntry, { kind: "item" }>["icon"] & NonNullable<string>;

const ENTRY_ICONS: Partial<Record<EntryIcon, LucideIcon>> = {
  copy: ThemedCopy,
  "rotate-cw": ThemedRotateCw,
  "arrow-left-to-line": ThemedArrowLeftToLine,
  "arrow-right-to-line": ThemedArrowRightToLine,
  "copy-x": ThemedCopyX,
  "eye-off": ThemedEyeOff,
  circle: ThemedCircle,
  pencil: ThemedPencil,
  "folder-input": ThemedFolderInput,
  x: ThemedX,
};

function EntryLeading({ icon }: { icon: EntryIcon }): ReactElement | null {
  const Icon = ENTRY_ICONS[icon];
  if (!Icon) return null;
  return <Icon size={16} color="" />;
}

function WorkspaceHeaderMenuEntryRow({
  entry,
}: {
  entry: WorkspaceTabMenuEntry;
}): ReactElement | null {
  if (entry.kind === "separator") {
    return <ContextMenuSeparator />;
  }
  const leading = (entry.icon ? <EntryLeading icon={entry.icon} /> : undefined) as
    | ReactElement
    | undefined;
  return (
    <ContextMenuItem
      onSelect={entry.onSelect}
      disabled={entry.disabled}
      destructive={entry.destructive}
      tooltip={entry.tooltip}
      testID={entry.testID}
      leading={leading}
    >
      {entry.hint ? `${entry.label}  ${entry.hint}` : entry.label}
    </ContextMenuItem>
  );
}

/**
 * The right-click menu on the workspace header title. It mirrors the focused tab's
 * context menu entry for entry: both menus are built by the same shared builder, so
 * they stay identical by construction.
 */
export function WorkspaceHeaderContextMenu({
  menuEntries,
  testID,
  children,
}: {
  menuEntries: WorkspaceTabMenuEntry[];
  testID: string;
  children: ReactNode;
}) {
  if (menuEntries.length === 0) {
    return children as ReactElement;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger testID={`${testID}-trigger`}>{children}</ContextMenuTrigger>
      <ContextMenuContent align="start" width={240} testID={testID}>
        {menuEntries.map((entry) => (
          <WorkspaceHeaderMenuEntryRow key={entry.key} entry={entry} />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
