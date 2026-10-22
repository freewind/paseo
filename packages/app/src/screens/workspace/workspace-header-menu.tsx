import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { WorkspaceMenuActionItems } from "@/components/workspace-menu-action-items";
import { useWorkspaceLabelMenuPages, type WorkspaceLabelTarget } from "@/workspace-labels/picker";
import { Ellipsis, Globe } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
  iconButtonChromeStyle,
} from "@/components/ui/icon-button-chrome";
import { TerminalProfileIcon } from "@/components/terminal-profile-icon";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import {
  getTerminalProfileIcon,
  resolveTerminalProfiles,
} from "@getpaseo/protocol/terminal-profiles";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import type { Theme } from "@/styles/theme";

const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedGlobe = withUnistyles(Globe);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const MENU_NEW_BROWSER_ICON = <ThemedGlobe size={16} uniProps={mutedColorMapping} />;
const MENU_NEW_TERMINAL_ICON = <TerminalProfileIcon iconKey={undefined} size={16} />;
function WorkspaceHeaderMenuTriggerIcon() {
  return (
    <ThemedEllipsis
      size={iconButtonChromeGlyphSize("large")}
      uniProps={extraMutedIconColorMapping}
    />
  );
}

/**
 * The compact header buttons draw at 32pt, under the 44pt touch minimum, and sit flush against
 * each other — so the slop can only grow vertically. Widening it would put two buttons' slop over
 * the same pixels, which is a worse miss than a small target.
 */
const COMPACT_HEADER_BUTTON_HIT_SLOP = { top: 8, bottom: 8 } as const;

/**
 * Actions that belong to the workspace itself rather than to a tab. Both header menus render them,
 * from the same callbacks, so the two surfaces can't drift.
 */
export interface WorkspaceHeaderWorkspaceActions {
  currentBranchName: string | null;
  showWorkspaceSetup: boolean;
  importAgentDisabled: boolean;
  copyPathDisabled: boolean;
  onOpenImportSheet: () => void;
  onCopyWorkspacePath: () => void;
  onCopyBranchName: () => void;
  onOpenSetupTab: () => void;
  onRename?: () => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onArchive?: () => void;
  isArchiving?: boolean;
  archiveLabel?: string;
  workspaceKey: string;
  workspaceTarget: WorkspaceLabelTarget | null;
  workspaceDirectory?: string | null;
  onCreateAgent: () => void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  /** Restores the agent archived most recently in this workspace and opens it. */
  onRestoreLastArchivedAgent?: () => void;
}

function WorkspaceHeaderWorkspaceActionItems({
  currentBranchName,
  showWorkspaceSetup,
  importAgentDisabled,
  copyPathDisabled,
  onOpenImportSheet,
  onCopyWorkspacePath,
  onCopyBranchName,
  onOpenSetupTab,
  onRename,
  onTogglePin,
  isPinned,
  onArchive,
  isArchiving,
  archiveLabel,
  workspaceKey,
  workspaceTarget,
  workspaceDirectory,
  onCreateAgent,
  onMarkAsRead,
  onMarkAsUnread,
  onRestoreLastArchivedAgent,
}: WorkspaceHeaderWorkspaceActions) {
  return (
    <WorkspaceMenuActionItems
      surface="dropdown"
      workspaceKey={workspaceKey}
      workspaceTarget={workspaceTarget}
      onCreateAgent={onCreateAgent}
      onCopyPath={onCopyWorkspacePath}
      copyPathDisabled={copyPathDisabled}
      onCopyBranchName={onCopyBranchName}
      showBranchName={Boolean(currentBranchName)}
      onRename={onRename}
      onMarkAsRead={onMarkAsRead}
      onMarkAsUnread={onMarkAsUnread}
      onTogglePin={onTogglePin}
      isPinned={isPinned}
      onOpenImportSheet={onOpenImportSheet}
      importAgentDisabled={importAgentDisabled}
      showImportSession
      showWorkspaceSetup={showWorkspaceSetup}
      onOpenSetupTab={onOpenSetupTab}
      openInFileManagerPath={workspaceDirectory}
      onArchive={onArchive}
      archiveLabel={archiveLabel}
      archiveStatus={isArchiving ? "pending" : "idle"}
      archivePendingLabel={archiveLabel}
      onRestoreLastArchivedAgent={onRestoreLastArchivedAgent}
    />
  );
}

function workspaceHeaderMenuButtonStyle({
  hovered,
  pressed,
  open,
}: {
  hovered: boolean;
  pressed: boolean;
  open: boolean;
}) {
  return iconButtonChromeStyle({ size: "large", state: { hovered, pressed, open } });
}

/**
 * Wide layouts make tabs from the tab strip's `+` menu, so this one carries workspace actions only.
 */
export function WorkspaceHeaderMenuDesktop(props: WorkspaceHeaderWorkspaceActions) {
  const { t } = useTranslation();
  const pages = useWorkspaceLabelMenuPages(props.workspaceTarget);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="workspace-header-menu-trigger"
        style={workspaceHeaderMenuButtonStyle}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.header.actions.workspaceActions")}
      >
        <WorkspaceHeaderMenuTriggerIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={220} testID="workspace-header-menu" pages={pages}>
        <WorkspaceHeaderWorkspaceActionItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface HeaderMenuProfileItemProps {
  profile: TerminalProfile;
  disabled: boolean;
  onCreateTerminalWithProfile: (profile: TerminalProfile) => void;
}

function HeaderMenuProfileItem({
  profile,
  disabled,
  onCreateTerminalWithProfile,
}: HeaderMenuProfileItemProps) {
  const handleSelect = useCallback(() => {
    onCreateTerminalWithProfile(profile);
  }, [onCreateTerminalWithProfile, profile]);

  const leading = useMemo(
    () => (
      <View style={styles.headerMenuProfileIconWrapper}>
        <TerminalProfileIcon iconKey={getTerminalProfileIcon(profile)} size={16} />
      </View>
    ),
    [profile],
  );

  return (
    <DropdownMenuItem leading={leading} disabled={disabled} onSelect={handleSelect}>
      {profile.name}
    </DropdownMenuItem>
  );
}

export interface WorkspaceHeaderMenuMobileProps extends WorkspaceHeaderWorkspaceActions {
  normalizedServerId: string;
  showCreateBrowserTab: boolean;
  createTerminalDisabled: boolean;
  onCreateTerminal: () => void;
  onCreateTerminalWithProfile: (profile: TerminalProfile) => void;
  onCreateBrowser: () => void;
}

/**
 * Compact layouts have no tab strip to launch from, so new tabs live here alongside the workspace
 * actions.
 */
export function WorkspaceHeaderMenuMobile({
  normalizedServerId,
  showCreateBrowserTab,
  createTerminalDisabled,
  onCreateTerminal,
  onCreateTerminalWithProfile,
  onCreateBrowser,
  ...workspaceActions
}: WorkspaceHeaderMenuMobileProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { config } = useDaemonConfig(normalizedServerId);
  const profiles = useMemo(
    () => resolveTerminalProfiles(config?.terminalProfiles),
    [config?.terminalProfiles],
  );
  const pages = useWorkspaceLabelMenuPages(workspaceActions.workspaceTarget);

  const handleEditProfiles = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(normalizedServerId, "terminals") as Href);
  }, [normalizedServerId, router]);

  return (
    <DropdownMenu compactMode="sheet">
      <DropdownMenuTrigger
        testID="workspace-header-menu-trigger"
        style={workspaceHeaderMenuButtonStyle}
        hitSlop={COMPACT_HEADER_BUTTON_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.header.actions.workspaceActions")}
      >
        <WorkspaceHeaderMenuTriggerIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        width={220}
        testID="workspace-header-menu"
        sheetTitle={t("workspace.header.actions.workspaceActions")}
        pages={pages}
      >
        {showCreateBrowserTab ? (
          <DropdownMenuItem
            testID="workspace-header-new-browser"
            leading={MENU_NEW_BROWSER_ICON}
            onSelect={onCreateBrowser}
          >
            {t("workspace.header.actions.newBrowser")}
          </DropdownMenuItem>
        ) : null}
        <WorkspaceHeaderWorkspaceActionItems
          {...workspaceActions}
          workspaceKey={workspaceActions.workspaceKey}
          workspaceTarget={workspaceActions.workspaceTarget}
          onCreateAgent={workspaceActions.onCreateAgent}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("workspace.tabs.actions.terminalProfilesMenu")}</DropdownMenuLabel>
        <DropdownMenuItem
          testID="workspace-header-new-terminal"
          leading={MENU_NEW_TERMINAL_ICON}
          disabled={createTerminalDisabled}
          onSelect={onCreateTerminal}
        >
          {t("workspace.header.actions.newTerminal")}
        </DropdownMenuItem>
        {profiles.map((profile) => (
          <HeaderMenuProfileItem
            key={profile.id}
            profile={profile}
            disabled={createTerminalDisabled}
            onCreateTerminalWithProfile={onCreateTerminalWithProfile}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          testID="workspace-header-edit-terminal-profiles"
          onSelect={handleEditProfiles}
        >
          {t("workspace.tabs.actions.editTerminalProfiles")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create({
  headerMenuProfileIconWrapper: {
    width: 16,
    height: 16,
  },
});
