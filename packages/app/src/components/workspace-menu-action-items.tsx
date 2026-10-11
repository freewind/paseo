import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Circle,
  CircleCheck,
  Copy,
  Import as ImportIcon,
  Pencil,
  Pin,
  PinOff,
  Settings,
  SquarePen,
  Tag,
} from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  DropdownMenuItem,
  DropdownMenuSubTrigger,
  useDropdownMenuClose,
} from "@/components/ui/dropdown-menu";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { OpenInFileManagerMenuItem } from "@/workspace/open-in-file-manager/menu-item";
import { WORKSPACE_LABEL_PAGE_ID, type WorkspaceLabelTarget } from "@/workspace-labels/picker";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import {
  useWorkspaceLayoutStore,
  useWorkspaceLayoutStoreHydrated,
} from "@/stores/workspace-layout-store";
import { selectRestorableHiddenAgentIds } from "@/workspace-tabs/agent-visibility";
import { restoreHiddenWorkspaceAgents } from "@/workspace-tabs/restore-hidden-agents";

const muted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const IconNew = withUnistyles(SquarePen);
const IconCopy = withUnistyles(Copy);
const IconPencil = withUnistyles(Pencil);
const IconCircle = withUnistyles(Circle);
const IconCircleCheck = withUnistyles(CircleCheck);
const IconArchive = withUnistyles(Archive);
const IconPin = withUnistyles(Pin);
const IconPinOff = withUnistyles(PinOff);
const IconTag = withUnistyles(Tag);
const IconImport = withUnistyles(ImportIcon);
const IconSettings = withUnistyles(Settings);

// Hoisted so the leading icons stay referentially stable across renders (react-perf lint rules).
const LEADING_NEW_AGENT = <IconNew size={16} uniProps={muted} />;
const LEADING_COPY = <IconCopy size={16} uniProps={muted} />;
const LEADING_RENAME = <IconPencil size={16} uniProps={muted} />;
const LEADING_IMPORT = <IconImport size={16} uniProps={muted} />;
const LEADING_MARK_AS_READ = <IconCircleCheck size={16} uniProps={muted} />;
const LEADING_MARK_AS_UNREAD = <IconCircle size={16} uniProps={muted} />;
const LEADING_PIN = <IconPin size={16} uniProps={muted} />;
const LEADING_UNPIN = <IconPinOff size={16} uniProps={muted} />;
const LEADING_TAG = <IconTag size={16} uniProps={muted} />;
const LEADING_SETTINGS = <IconSettings size={16} uniProps={muted} />;
const LEADING_ARCHIVE = <IconArchive size={16} uniProps={muted} />;

export type WorkspaceMenuSurface = "context" | "dropdown";

export interface WorkspaceMenuActionItemsProps {
  surface: WorkspaceMenuSurface;
  testIDPrefix?: string;
  workspaceKey: string;
  workspaceTarget: WorkspaceLabelTarget | null;
  onCreateAgent?: () => void;
  onCopyPath?: () => void;
  copyPathDisabled?: boolean;
  onCopyBranchName?: () => void;
  showBranchName?: boolean;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onOpenImportSheet?: () => void;
  importAgentDisabled?: boolean;
  showImportSession?: boolean;
  showWorkspaceSetup?: boolean;
  onOpenSetupTab?: () => void;
  openInFileManagerPath?: string | null;
  onArchive?: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}

function WorkspaceMenuItem({
  surface,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & { surface: WorkspaceMenuSurface }) {
  return surface === "context" ? <ContextMenuItem {...props} /> : <DropdownMenuItem {...props} />;
}

/**
 * Entry items: everything that launches or edits the workspace identity. Split from the state
 * items below so neither component crosses the complexity lint limit.
 */
function WorkspaceMenuEntryItems({
  surface,
  testIDPrefix = "workspace-menu",
  workspaceKey,
  onCreateAgent,
  onCopyPath,
  copyPathDisabled = false,
  onCopyBranchName,
  showBranchName = true,
  onRename,
  onOpenImportSheet,
  importAgentDisabled = false,
  showImportSession = false,
}: WorkspaceMenuActionItemsProps) {
  const { t } = useTranslation();
  const closeMenu = useDropdownMenuClose();
  const handleRename = useCallback(() => {
    if (!onRename) return;
    // Close the menu first so the rename modal doesn't stack on top of it.
    closeMenu();
    onRename();
  }, [closeMenu, onRename]);

  return (
    <>
      {onCreateAgent ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-new-agent-${workspaceKey}`}
          leading={LEADING_NEW_AGENT}
          onSelect={onCreateAgent}
        >
          {t("workspace.header.actions.newAgent")}
        </WorkspaceMenuItem>
      ) : null}
      {onCopyPath ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-copy-path-${workspaceKey}`}
          leading={LEADING_COPY}
          disabled={copyPathDisabled}
          onSelect={onCopyPath}
        >
          {t("workspace.header.actions.copyPath")}
        </WorkspaceMenuItem>
      ) : null}
      {onRename ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-rename-${workspaceKey}`}
          leading={LEADING_RENAME}
          onSelect={handleRename}
        >
          {t("sidebar.workspace.actions.rename")}
        </WorkspaceMenuItem>
      ) : null}
      {onCopyBranchName && showBranchName ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-copy-branch-name-${workspaceKey}`}
          leading={LEADING_COPY}
          onSelect={onCopyBranchName}
        >
          {t("workspace.header.actions.copyBranchName")}
        </WorkspaceMenuItem>
      ) : null}
      {showImportSession && onOpenImportSheet ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-import-session-${workspaceKey}`}
          leading={LEADING_IMPORT}
          disabled={importAgentDisabled}
          onSelect={onOpenImportSheet}
        >
          {t("workspace.header.actions.importSession")}
        </WorkspaceMenuItem>
      ) : null}
    </>
  );
}

/**
 * State items: read state, pinning, labels, setup, folder, archive. `WorkspaceMenuEntryItems`
 * renders first so both surfaces keep one stable order.
 */
function RestoreHiddenAgentsMenuItem({
  surface,
  testID,
  workspaceKey,
  workspaceTarget,
}: {
  surface: WorkspaceMenuSurface;
  testID: string;
  workspaceKey: string;
  workspaceTarget: WorkspaceLabelTarget;
}) {
  const { t } = useTranslation();
  const closeMenu = useDropdownMenuClose();
  const hasHydratedLayout = useWorkspaceLayoutStoreHydrated();
  const { serverId, workspaceId } = workspaceTarget;
  const session = useSessionStore((state) => state.sessions[serverId]);
  const explicitlyHiddenAgentIds = useWorkspaceLayoutStore(
    (state) => state.explicitlyHiddenAgentIdsByWorkspace[workspaceKey],
  );
  const restorableAgentIds = selectRestorableHiddenAgentIds({
    hasHydratedAgents: session?.hasHydratedAgents === true,
    sessionAgents: session?.agents,
    workspaceId,
    explicitlyHiddenAgentIds,
  });
  const isDisabled =
    !hasHydratedLayout || session?.hasHydratedAgents !== true || restorableAgentIds.length === 0;
  const handleRestore = useCallback(() => {
    if (isDisabled) return;
    closeMenu();
    restoreHiddenWorkspaceAgents({
      serverId,
      workspaceId,
      readSnapshot: () => {
        const currentSession = useSessionStore.getState().sessions[serverId];
        const state = useWorkspaceLayoutStore.getState();
        return {
          hasHydratedAgents: currentSession?.hasHydratedAgents === true,
          hasHydratedLayout: useWorkspaceLayoutStore.persist.hasHydrated(),
          sessionAgents: currentSession?.agents,
          explicitlyHiddenAgentIds: state.explicitlyHiddenAgentIdsByWorkspace[workspaceKey],
        };
      },
      navigateToWorkspace: (input) => navigateToWorkspace(input),
      openTab: (input) => useWorkspaceLayoutStore.getState().openTab(input),
      focusedPaneId: () =>
        useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]?.focusedPaneId ?? null,
    });
  }, [closeMenu, isDisabled, serverId, workspaceId, workspaceKey]);

  return (
    <WorkspaceMenuItem
      surface={surface}
      testID={testID}
      disabled={isDisabled}
      onSelect={handleRestore}
    >
      {t("workspace.header.actions.showHiddenAgents", { count: restorableAgentIds.length })}
    </WorkspaceMenuItem>
  );
}

function WorkspaceMenuStateItems(props: WorkspaceMenuActionItemsProps) {
  const {
    surface,
    testIDPrefix = "workspace-menu",
    workspaceKey,
    workspaceTarget,
    onMarkAsRead,
    onMarkAsUnread,
    onTogglePin,
    isPinned,
    showWorkspaceSetup = false,
    onOpenSetupTab,
    openInFileManagerPath,
    onArchive,
    archiveLabel,
    archiveStatus = "idle",
    archivePendingLabel,
    archiveShortcutKeys,
  } = props;
  const { t } = useTranslation();
  const closeMenu = useDropdownMenuClose();
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );
  const handleTogglePin = useCallback(() => {
    if (!onTogglePin) return;
    // Close the menu first so the pin toggle's optimistic state doesn't stack on top of it.
    closeMenu();
    onTogglePin();
  }, [closeMenu, onTogglePin]);
  const handleArchive = useCallback(() => {
    if (!onArchive) return;
    // Close the menu first so the archive flow (confirm dialog / redirect) doesn't stack on it.
    closeMenu();
    onArchive();
  }, [closeMenu, onArchive]);
  return (
    <>
      {onMarkAsRead ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-mark-as-read-${workspaceKey}`}
          leading={LEADING_MARK_AS_READ}
          onSelect={onMarkAsRead}
        >
          {t("sidebar.workspace.actions.markAsRead")}
        </WorkspaceMenuItem>
      ) : null}
      {onMarkAsUnread ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-mark-as-unread-${workspaceKey}`}
          leading={LEADING_MARK_AS_UNREAD}
          onSelect={onMarkAsUnread}
        >
          {t("sidebar.workspace.actions.markAsUnread")}
        </WorkspaceMenuItem>
      ) : null}
      {workspaceTarget ? (
        <RestoreHiddenAgentsMenuItem
          surface={surface}
          testID={`${testIDPrefix}-restore-hidden-agents-${workspaceKey}`}
          workspaceKey={workspaceKey}
          workspaceTarget={workspaceTarget}
        />
      ) : null}
      {onTogglePin ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-pin-${workspaceKey}`}
          leading={isPinned ? LEADING_UNPIN : LEADING_PIN}
          onSelect={handleTogglePin}
        >
          {t(isPinned ? "sidebar.workspace.actions.unpin" : "sidebar.workspace.actions.pin")}
        </WorkspaceMenuItem>
      ) : null}
      {workspaceTarget ? (
        <DropdownMenuSubTrigger
          id={WORKSPACE_LABEL_PAGE_ID}
          leading={LEADING_TAG}
          testID={`${testIDPrefix}-labels-${workspaceKey}`}
        >
          {t("workspaceLabels.title")}
        </DropdownMenuSubTrigger>
      ) : null}
      {showWorkspaceSetup && onOpenSetupTab ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-show-setup-${workspaceKey}`}
          leading={LEADING_SETTINGS}
          onSelect={onOpenSetupTab}
        >
          {t("workspace.header.actions.showSetup")}
        </WorkspaceMenuItem>
      ) : null}
      <OpenInFileManagerMenuItem
        surface={surface}
        path={openInFileManagerPath}
        testID={`${testIDPrefix}-open-folder-${workspaceKey}`}
      />
      {onArchive ? (
        <WorkspaceMenuItem
          surface={surface}
          testID={`${testIDPrefix}-archive-${workspaceKey}`}
          leading={LEADING_ARCHIVE}
          trailing={archiveTrailing}
          status={archiveStatus}
          pendingLabel={archivePendingLabel}
          onSelect={handleArchive}
        >
          {archiveLabel ?? t("sidebar.workspace.actions.archive")}
        </WorkspaceMenuItem>
      ) : null}
    </>
  );
}

export function WorkspaceMenuActionItems(props: WorkspaceMenuActionItemsProps) {
  return (
    <>
      <WorkspaceMenuEntryItems {...props} />
      <WorkspaceMenuStateItems {...props} />
    </>
  );
}
