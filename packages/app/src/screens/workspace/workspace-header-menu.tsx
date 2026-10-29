import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Circle,
  CircleCheck,
  Copy,
  Ellipsis,
  Globe,
  Import as ImportIcon,
  Pencil,
  Pin,
  PinOff,
  Settings,
  SquarePen,
  Tag,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  useDropdownMenuClose,
} from "@/components/ui/dropdown-menu";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
  iconButtonChromeStyle,
  useIconButtonChromeStyle,
} from "@/components/ui/icon-button-chrome";
import { TerminalProfileIcon } from "@/components/terminal-profile-icon";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import {
  getTerminalProfileIcon,
  resolveTerminalProfiles,
} from "@getpaseo/protocol/terminal-profiles";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import type { Theme } from "@/styles/theme";
import {
  useWorkspaceScriptsMenuPages,
  type UseWorkspaceScriptsMenuPagesInput,
} from "@/screens/workspace/scripts";
import { usePluginWorkspaceMenu } from "@/plugins";
import { OpenInFileManagerMenuItem } from "@/workspace/open-in-file-manager/menu-item";
import { WORKSPACE_LABEL_PAGE_ID, type WorkspaceLabelTarget } from "@/workspace-labels/picker";

const ThemedEllipsis = withUnistyles(Ellipsis);
const ThemedCopy = withUnistyles(Copy);
const ThemedGlobe = withUnistyles(Globe);
const ThemedImport = withUnistyles(ImportIcon);
const ThemedSettings = withUnistyles(Settings);
const ThemedRename = withUnistyles(Pencil);
const ThemedMarkAsRead = withUnistyles(CircleCheck);
const ThemedMarkAsUnread = withUnistyles(Circle);
const ThemedPin = withUnistyles(Pin);
const ThemedPinOff = withUnistyles(PinOff);
const ThemedTag = withUnistyles(Tag);
const ThemedArchive = withUnistyles(Archive);
const ThemedNewAgent = withUnistyles(SquarePen);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const MENU_NEW_AGENT_ICON = <ThemedNewAgent size={16} uniProps={mutedColorMapping} />;
const MENU_NEW_BROWSER_ICON = <ThemedGlobe size={16} uniProps={mutedColorMapping} />;
const MENU_IMPORT_ICON = <ThemedImport size={16} uniProps={mutedColorMapping} />;
const MENU_COPY_ICON = <ThemedCopy size={16} uniProps={mutedColorMapping} />;
const MENU_RENAME_ICON = <ThemedRename size={16} uniProps={mutedColorMapping} />;
const MENU_MARK_AS_READ_ICON = <ThemedMarkAsRead size={16} uniProps={mutedColorMapping} />;
const MENU_MARK_AS_UNREAD_ICON = <ThemedMarkAsUnread size={16} uniProps={mutedColorMapping} />;
const MENU_PIN_ICON = <ThemedPin size={16} uniProps={mutedColorMapping} />;
const MENU_UNPIN_ICON = <ThemedPinOff size={16} uniProps={mutedColorMapping} />;
const MENU_LABELS_ICON = <ThemedTag size={16} uniProps={mutedColorMapping} />;
const MENU_SETTINGS_ICON = <ThemedSettings size={16} uniProps={mutedColorMapping} />;
const MENU_ARCHIVE_ICON = <ThemedArchive size={16} uniProps={mutedColorMapping} />;
function WorkspaceHeaderMenuTriggerIcon() {
  return (
    <ThemedEllipsis
      size={iconButtonChromeGlyphSize("large")}
      uniProps={extraMutedIconColorMapping}
    />
  );
}

/** The ⋯ with a dot on it, for when something inside the menu needs looking at. */
function WorkspaceHeaderMenuAttentionTriggerIcon() {
  return (
    <View>
      <WorkspaceHeaderMenuTriggerIcon />
      <View style={styles.attentionDot} testID="workspace-header-menu-attention" />
    </View>
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
 * 用同一批回调，这样紧凑与宽屏不会走偏。
 *
 * 侧栏自己写了一份这些项，两处要保持同项、同序、同措辞；各写自己的 JSX，
 * 上游改动才只落在一个文件里。
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
  /** 菜单所属工作区的标识；菜单不为每一行渲染 test id。 */
  workspaceKey: string;
  workspaceTarget: WorkspaceLabelTarget | null;
  workspaceDirectory?: string | null;
  onCreateAgent: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onMarkAsUnread?: () => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  onArchive?: () => void;
  isArchiving?: boolean;
  archiveLabel?: string;
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
  workspaceTarget,
  workspaceDirectory,
  onCreateAgent,
  onRename,
  onMarkAsRead,
  onMarkAsUnread,
  onTogglePin,
  isPinned,
  onArchive,
  isArchiving,
  archiveLabel,
}: WorkspaceHeaderWorkspaceActions) {
  const { t } = useTranslation();
  const closeMenu = useDropdownMenuClose();
  const handleRename = useCallback(() => {
    if (!onRename) return;
    // 先关菜单，免得重命名弹窗叠在它上面。
    closeMenu();
    onRename();
  }, [closeMenu, onRename]);
  const handleTogglePin = useCallback(() => {
    if (!onTogglePin) return;
    // 先关菜单，免得固定开关的乐观状态叠在它上面。
    closeMenu();
    onTogglePin();
  }, [closeMenu, onTogglePin]);
  const handleArchive = useCallback(() => {
    if (!onArchive) return;
    // 先关菜单，免得归档流程（确认弹窗 / 跳转）叠在它上面。
    closeMenu();
    onArchive();
  }, [closeMenu, onArchive]);
  return (
    <>
      <DropdownMenuItem
        testID="workspace-header-new-agent"
        leading={MENU_NEW_AGENT_ICON}
        onSelect={onCreateAgent}
      >
        {t("workspace.header.actions.newAgent")}
      </DropdownMenuItem>
      <DropdownMenuItem
        testID="workspace-header-copy-path"
        leading={MENU_COPY_ICON}
        disabled={copyPathDisabled}
        onSelect={onCopyWorkspacePath}
      >
        {t("workspace.header.actions.copyPath")}
      </DropdownMenuItem>
      {currentBranchName ? (
        <DropdownMenuItem
          testID="workspace-header-copy-branch-name"
          leading={MENU_COPY_ICON}
          onSelect={onCopyBranchName}
        >
          {t("workspace.header.actions.copyBranchName")}
        </DropdownMenuItem>
      ) : null}
      {onRename ? (
        <DropdownMenuItem
          testID="workspace-header-rename"
          leading={MENU_RENAME_ICON}
          onSelect={handleRename}
        >
          {t("sidebar.workspace.actions.rename")}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        testID="workspace-header-import-agent"
        leading={MENU_IMPORT_ICON}
        disabled={importAgentDisabled}
        onSelect={onOpenImportSheet}
      >
        {t("workspace.header.actions.importSession")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {onMarkAsRead ? (
        <DropdownMenuItem
          testID="workspace-header-mark-as-read"
          leading={MENU_MARK_AS_READ_ICON}
          onSelect={onMarkAsRead}
        >
          {t("sidebar.workspace.actions.markAsRead")}
        </DropdownMenuItem>
      ) : null}
      {onMarkAsUnread ? (
        <DropdownMenuItem
          testID="workspace-header-mark-as-unread"
          leading={MENU_MARK_AS_UNREAD_ICON}
          onSelect={onMarkAsUnread}
        >
          {t("sidebar.workspace.actions.markAsUnread")}
        </DropdownMenuItem>
      ) : null}
      {onTogglePin ? (
        <DropdownMenuItem
          testID="workspace-header-pin"
          leading={isPinned ? MENU_UNPIN_ICON : MENU_PIN_ICON}
          onSelect={handleTogglePin}
        >
          {t(isPinned ? "sidebar.workspace.actions.unpin" : "sidebar.workspace.actions.pin")}
        </DropdownMenuItem>
      ) : null}
      {workspaceTarget ? (
        <DropdownMenuSubTrigger
          id={WORKSPACE_LABEL_PAGE_ID}
          leading={MENU_LABELS_ICON}
          testID="workspace-header-labels"
        >
          {t("workspaceLabels.title")}
        </DropdownMenuSubTrigger>
      ) : null}
      {showWorkspaceSetup ? (
        <DropdownMenuItem
          testID="workspace-header-show-setup"
          leading={MENU_SETTINGS_ICON}
          onSelect={onOpenSetupTab}
        >
          {t("workspace.header.actions.showSetup")}
        </DropdownMenuItem>
      ) : null}
      <OpenInFileManagerMenuItem
        surface="dropdown"
        path={workspaceDirectory}
        testID="workspace-header-open-folder"
      />
      {onArchive ? (
        <DropdownMenuItem
          testID="workspace-header-archive"
          leading={MENU_ARCHIVE_ICON}
          status={isArchiving ? "pending" : "idle"}
          pendingLabel={archiveLabel}
          onSelect={handleArchive}
        >
          {t("sidebar.workspace.actions.archive")}
        </DropdownMenuItem>
      ) : null}
    </>
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
      <DropdownMenuContent align="start" width={220} testID="workspace-header-menu">
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
  normalizedWorkspaceId: string;
  scripts: UseWorkspaceScriptsMenuPagesInput;
  showCreateBrowserTab: boolean;
  createTerminalDisabled: boolean;
  onCreateTerminalWithProfile: (profile: TerminalProfile) => void;
  onCreateBrowser: () => void;
}

/**
 * Compact layouts have no tab strip. New agent and New terminal sit in the tab switcher's footer;
 * the rarer launches stay here alongside the workspace actions.
 *
 * The header has no room for a scripts button either, so scripts are a page of this menu, and the
 * ⋯ carries a dot while a running service is unhealthy. Plugin header buttons are rows here for the
 * same reason.
 */
export function WorkspaceHeaderMenuMobile({
  normalizedServerId,
  normalizedWorkspaceId,
  scripts,
  showCreateBrowserTab,
  createTerminalDisabled,
  onCreateTerminalWithProfile,
  onCreateBrowser,
  ...workspaceActions
}: WorkspaceHeaderMenuMobileProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const triggerStyle = useIconButtonChromeStyle({ size: "large" });
  const { config } = useDaemonConfig(normalizedServerId);
  const profiles = useMemo(
    () => resolveTerminalProfiles(config?.terminalProfiles),
    [config?.terminalProfiles],
  );

  const handleEditProfiles = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(normalizedServerId, "terminals") as Href);
  }, [normalizedServerId, router]);
  const scriptsMenu = useWorkspaceScriptsMenuPages(scripts);
  const pluginMenu = usePluginWorkspaceMenu(normalizedServerId, normalizedWorkspaceId);
  const pages = useMemo(
    () => [...scriptsMenu.pages, ...pluginMenu.pages],
    [scriptsMenu.pages, pluginMenu.pages],
  );

  return (
    <DropdownMenu compactMode="sheet">
      <DropdownMenuTrigger
        testID="workspace-header-menu-trigger"
        style={triggerStyle}
        hitSlop={COMPACT_HEADER_BUTTON_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={
          scriptsMenu.needsAttention
            ? t("workspace.header.actions.workspaceActionsUnhealthy")
            : t("workspace.header.actions.workspaceActions")
        }
      >
        {scriptsMenu.needsAttention ? (
          <WorkspaceHeaderMenuAttentionTriggerIcon />
        ) : (
          <WorkspaceHeaderMenuTriggerIcon />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        width={220}
        testID="workspace-header-menu"
        pages={pages}
        sheetTitle={t("workspace.header.actions.workspaceActions")}
      >
        {scriptsMenu.trigger}
        {pluginMenu.rows}
        {pluginMenu.rows.length > 0 ? <DropdownMenuSeparator /> : null}
        {showCreateBrowserTab ? (
          <DropdownMenuItem
            testID="workspace-header-new-browser"
            leading={MENU_NEW_BROWSER_ICON}
            onSelect={onCreateBrowser}
          >
            {t("workspace.header.actions.newBrowser")}
          </DropdownMenuItem>
        ) : null}
        <WorkspaceHeaderWorkspaceActionItems {...workspaceActions} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("workspace.tabs.actions.terminalProfilesMenu")}</DropdownMenuLabel>
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

const ATTENTION_DOT_SIZE = 6;

const styles = StyleSheet.create((theme) => ({
  headerMenuProfileIconWrapper: {
    width: 16,
    height: 16,
  },
  // Same red as the Scripts row's unhealthy ▶, so the dot and the row it leads to agree.
  attentionDot: {
    position: "absolute",
    top: -1,
    right: -2,
    width: ATTENTION_DOT_SIZE,
    height: ATTENTION_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.palette.red[500],
  },
}));
