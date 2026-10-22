import {
  View,
  Text,
  Pressable,
  Modal,
  RefreshControl,
  FlatList,
  type ListRenderItem,
  type PressableStateCallbackType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useTimeAgo } from "@/hooks/use-time-ago";
import { type AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useDeleteAgent } from "@/hooks/use-delete-agent";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { Archive, ArchiveRestore, ChevronRight, Trash2 } from "lucide-react-native";
import { useProviderIcon } from "@/components/provider-icons";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InlineConfirm } from "@/components/ui/inline-confirm";
import { findHighlightRanges } from "@/components/ui/highlighted-text-segments";

interface AgentListProps {
  agents: AggregatedAgent[];
  showCheckoutInfo?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  selectedAgentId?: string;
  onAgentSelect?: () => void;
  listFooterComponent?: ReactElement | null;
  showAttentionIndicator?: boolean;
  showHostColumn?: boolean;
  search?: string;
}

type DateSectionKey = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";

const DATE_SECTION_ORDER = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "older",
] as const satisfies readonly DateSectionKey[];

type FlatListItem =
  | { type: "header"; key: string; section: DateSectionKey }
  | { type: "agent"; key: string; agent: AggregatedAgent };

function deriveDateSectionKey(lastActivityAt: Date): DateSectionKey {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const activityStart = new Date(
    lastActivityAt.getFullYear(),
    lastActivityAt.getMonth(),
    lastActivityAt.getDate(),
  );

  if (activityStart.getTime() >= todayStart.getTime()) {
    return "today";
  }
  if (activityStart.getTime() >= yesterdayStart.getTime()) {
    return "yesterday";
  }

  const diffTime = todayStart.getTime() - activityStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) {
    return "thisWeek";
  }
  if (diffDays <= 30) {
    return "thisMonth";
  }
  return "older";
}

function formatDateSectionLabel(t: TFunction, section: DateSectionKey): string {
  switch (section) {
    case "today":
      return t("agentList.dateSections.today");
    case "yesterday":
      return t("agentList.dateSections.yesterday");
    case "thisWeek":
      return t("agentList.dateSections.thisWeek");
    case "thisMonth":
      return t("agentList.dateSections.thisMonth");
    case "older":
      return t("agentList.dateSections.older");
  }
}

function SessionBadge({
  label,
  icon,
  tone = "neutral",
}: {
  label: string;
  icon?: ReactElement;
  tone?: "neutral" | "warning" | "danger";
}) {
  let variant: StatusBadgeVariant = "muted";
  if (tone === "warning") variant = "warning";
  else if (tone === "danger") variant = "error";
  return <StatusBadge label={label} variant={variant} leading={icon} />;
}

function SessionRowBadges({
  agent,
  archivedIcon,
  pendingPermissionCount,
  showDesktopAttention,
}: {
  agent: AggregatedAgent;
  archivedIcon: ReactElement;
  pendingPermissionCount: number;
  showDesktopAttention: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {agent.parentAgentId ? <SessionBadge label={t("agentList.badges.subagent")} /> : null}
      {agent.archivedAt ? (
        <SessionBadge label={t("agentList.badges.archived")} icon={archivedIcon} />
      ) : null}
      {pendingPermissionCount > 0 ? (
        <SessionBadge
          label={t("agentList.badges.pending", { count: pendingPermissionCount })}
          tone="warning"
        />
      ) : null}
      {showDesktopAttention ? (
        <SessionBadge label={t("agentList.badges.attention")} tone="danger" />
      ) : null}
    </>
  );
}

function SessionRowTrailingAttention({
  isMobile,
  showAttentionIndicator,
  requiresAttention,
}: {
  isMobile: boolean;
  showAttentionIndicator: boolean;
  requiresAttention: boolean | undefined;
}) {
  const { t } = useTranslation();
  if (!isMobile || !showAttentionIndicator || !requiresAttention) {
    return null;
  }
  return (
    <View style={styles.rowTrailing}>
      <SessionBadge label={t("agentList.badges.attention")} tone="danger" />
    </View>
  );
}

function SessionRow({
  agent,
  search,
  isMobile,
  selectedAgentId,
  showAttentionIndicator,
  showHostColumn,
  onPress,
  onLongPress,
  onToggleArchive,
  onDeleteAgent,
}: {
  agent: AggregatedAgent;
  search?: string;
  isMobile: boolean;
  selectedAgentId?: string;
  showAttentionIndicator: boolean;
  showHostColumn: boolean;
  onPress: (agent: AggregatedAgent) => void;
  onLongPress: (agent: AggregatedAgent) => void;
  onToggleArchive: (agent: AggregatedAgent) => void;
  onDeleteAgent: (agent: AggregatedAgent) => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const agentKey = `${agent.serverId}:${agent.id}`;
  const isSelected = selectedAgentId === agentKey;
  const projectName = agent.projectPlacement?.projectName ?? "";
  const branch = agent.projectPlacement?.checkout.currentBranch ?? "";
  const workspaceName = agent.projectPlacement?.workspaceName ?? "";
  const ProviderIcon = useProviderIcon(agent.provider, agent.serverId);
  const pendingPermissionCount = agent.pendingPermissionCount ?? 0;
  const ranges = useMemo(
    () => ({
      workspace: findHighlightRanges(search ?? "", workspaceName),
      title: findHighlightRanges(search ?? "", agent.title ?? ""),
      branch: findHighlightRanges(search ?? "", branch),
      project: findHighlightRanges(search ?? "", projectName),
    }),
    [search, workspaceName, agent.title, branch, projectName],
  );

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.row,
      isSelected && styles.rowSelected,
      isHovered && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isHovered, isSelected],
  );

  const handlePress = useCallback(() => onPress(agent), [onPress, agent]);
  const handleLongPress = useCallback(() => onLongPress(agent), [onLongPress, agent]);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleToggleArchive = useCallback(() => onToggleArchive(agent), [agent, onToggleArchive]);
  const handleDeleteAgent = useCallback(() => onDeleteAgent(agent), [agent, onDeleteAgent]);

  const archivedIcon = useMemo(
    () => <Archive size={theme.fontSize.sm} color={theme.colors.foregroundMuted} />,
    [theme.fontSize.sm, theme.colors.foregroundMuted],
  );
  const showDesktopAttention =
    !isMobile && showAttentionIndicator && Boolean(agent.requiresAttention);

  const agentTitle = (
    <View style={styles.agentTitleRow}>
      <View style={styles.providerIconWrap}>
        <ProviderIcon size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </View>
      <HighlightedText
        text={agent.title || t("agentList.fallbackTitle")}
        ranges={ranges.title}
        style={styles.sessionTitle}
        numberOfLines={1}
        testID={`agent-row-title-${agent.serverId}-${agent.id}`}
      />
    </View>
  );

  return (
    // Hover lives on the plain view: the row's own actions are pressables, and a pressable that
    // tracks hover loses it to them — which is what made the revealed icons flicker.
    <View onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
      <Pressable
        style={pressableStyle}
        onPress={handlePress}
        onLongPress={handleLongPress}
        accessibilityRole="button"
        testID={`agent-row-${agent.serverId}-${agent.id}`}
      >
        <View style={styles.rowContent}>
          <View style={styles.rowTitleRow}>
            <HighlightedText
              text={workspaceName || projectName}
              ranges={workspaceName ? ranges.workspace : ranges.project}
              style={styles.workspaceTitleText}
              numberOfLines={1}
              testID={`agent-row-workspace-${agent.serverId}-${agent.id}`}
            />
            {!isMobile ? (
              <>
                <ChevronRight size={theme.iconSize.xs} color={theme.colors.foregroundMuted} />
                {agentTitle}
              </>
            ) : null}
            <SessionRowBadges
              agent={agent}
              archivedIcon={archivedIcon}
              pendingPermissionCount={pendingPermissionCount}
              showDesktopAttention={showDesktopAttention}
            />
          </View>
          {isMobile ? agentTitle : null}
          {isMobile ? (
            <View style={styles.rowMetaRow}>
              <HighlightedText
                text={projectName}
                ranges={ranges.project}
                style={styles.sessionMetaText}
                numberOfLines={1}
                testID={`agent-row-project-${agent.serverId}-${agent.id}`}
              />
              <Text style={styles.sessionMetaSeparator}>·</Text>
              <HighlightedText
                text={branch}
                ranges={ranges.branch}
                style={styles.sessionMetaText}
                numberOfLines={1}
                testID={`agent-row-branch-${agent.serverId}-${agent.id}`}
              />
              <Text style={styles.sessionMetaSeparator}>·</Text>
              <AgentActivityTime date={agent.lastActivityAt} isMobile />
              {showHostColumn && agent.serverLabel ? (
                <>
                  <Text style={styles.sessionMetaSeparator}>·</Text>
                  <Text style={styles.sessionMetaText} numberOfLines={1}>
                    {agent.serverLabel}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
        {!isMobile ? (
          <View style={styles.rowColumns}>
            <HighlightedText
              text={projectName}
              ranges={ranges.project}
              style={styles.columnMeta}
              numberOfLines={1}
              testID={`agent-row-project-${agent.serverId}-${agent.id}`}
            />
            <SessionModelCell
              model={agent.model}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
            {showHostColumn ? (
              <Text style={styles.columnMetaHost} numberOfLines={1}>
                {agent.serverLabel}
              </Text>
            ) : null}
            <HighlightedText
              text={branch}
              ranges={ranges.branch}
              style={styles.columnMeta}
              numberOfLines={1}
              testID={`agent-row-branch-${agent.serverId}-${agent.id}`}
            />
            <AgentActivityTime date={agent.lastActivityAt} isMobile={false} />
            <AgentRowActions
              archived={agent.archivedAt != null}
              visible={isHovered}
              testIDPrefix={`agent-row-${agent.serverId}-${agent.id}`}
              onToggleArchive={handleToggleArchive}
              onDeleteAgent={handleDeleteAgent}
            />
          </View>
        ) : null}
        <SessionRowTrailingAttention
          isMobile={isMobile}
          showAttentionIndicator={showAttentionIndicator}
          requiresAttention={agent.requiresAttention}
        />
      </Pressable>
    </View>
  );
}

/**
 * The model column. It sits inside the row's Pressable, so it takes the row's press handlers:
 * a nested control that swallowed the tap would leave a dead patch in the row that opens the
 * session. Only the hover is this cell's own, and an empty model renders nothing at all.
 */
function SessionModelCell({
  model,
  onPress,
  onLongPress,
}: {
  model: string | null;
  onPress: () => void;
  onLongPress: () => void;
}): ReactElement | null {
  if (!model) return null;
  return (
    <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable style={styles.columnModel} onPress={onPress} onLongPress={onLongPress}>
          <Text style={styles.columnModelText} numberOfLines={1} ellipsizeMode="tail">
            {model}
          </Text>
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" offset={6} maxWidth={420}>
        <Text style={styles.tooltipText}>{model}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The revealed actions are icons only, so each says what it does on hover. The label doubles as
 * the accessibility label, so the spoken and the hovered text cannot drift apart.
 */
function RowActionTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The row's own actions, revealed on hover so the columns stay quiet at rest. Archiving flips
 * with the row's archived state; deleting asks in place, because a session removed here is gone.
 */
function AgentRowActions({
  archived,
  visible,
  testIDPrefix,
  onToggleArchive,
  onDeleteAgent,
}: {
  archived: boolean;
  visible: boolean;
  testIDPrefix: string;
  onToggleArchive: () => void;
  onDeleteAgent: () => void;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const archiveLabel = archived
    ? t("agentPanel.archived.unarchive")
    : t("agentList.archiveSheet.archive");
  const deleteLabel = t("agentList.deleteSheet.delete");
  return (
    <View
      style={[styles.rowActions, visible ? null : styles.rowActionsHidden]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <RowActionTooltip label={archiveLabel}>
        <Pressable
          onPress={onToggleArchive}
          accessibilityRole="button"
          accessibilityLabel={archiveLabel}
          testID={`${testIDPrefix}-${archived ? "unarchive" : "archive"}`}
          style={styles.rowAction}
          hitSlop={6}
        >
          {archived ? (
            <ArchiveRestore size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          ) : (
            <Archive size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          )}
        </Pressable>
      </RowActionTooltip>
      <RowActionTooltip label={deleteLabel}>
        {/* The tooltip needs a ref host; `InlineConfirm` is a function component. */}
        <View style={styles.rowActionTooltipHost} collapsable={false}>
          <InlineConfirm
            triggerLabel={deleteLabel}
            confirmLabel={deleteLabel}
            cancelLabel={t("common.actions.cancel")}
            onConfirm={onDeleteAgent}
            destructive
            testID={`${testIDPrefix}-delete`}
          >
            <Trash2 size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
          </InlineConfirm>
        </View>
      </RowActionTooltip>
    </View>
  );
}

function AgentActivityTime({ date, isMobile }: { date: Date; isMobile: boolean }) {
  const label = useTimeAgo(date);
  return (
    <Text style={isMobile ? styles.sessionMetaText : styles.columnMetaFixed} numberOfLines={1}>
      {label}
    </Text>
  );
}

export function AgentList({
  agents,
  isRefreshing = false,
  onRefresh,
  selectedAgentId,
  onAgentSelect,
  listFooterComponent,
  showAttentionIndicator = true,
  showHostColumn = false,
  search,
}: AgentListProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [actionAgent, setActionAgent] = useState<AggregatedAgent | null>(null);
  const isMobile = useIsCompactFormFactor();
  const { archiveAgent } = useArchiveAgent();
  const { deleteAgent, isDeletingAgent } = useDeleteAgent();

  const actionClient = useSessionStore((state) =>
    actionAgent?.serverId ? (state.sessions[actionAgent.serverId]?.client ?? null) : null,
  );

  const isActionSheetVisible = actionAgent !== null;
  const isActionDaemonUnavailable = Boolean(actionAgent?.serverId && !actionClient);

  const handleAgentPress = useCallback(
    (agent: AggregatedAgent) => {
      if (isActionSheetVisible) {
        return;
      }

      const serverId = agent.serverId;
      const agentId = agent.id;

      onAgentSelect?.();
      navigateToAgent({
        serverId,
        agentId,
        workspaceId: agent.workspaceId,
        pin: true,
      });
    },
    [isActionSheetVisible, onAgentSelect],
  );

  const handleAgentLongPress = useCallback((agent: AggregatedAgent) => {
    setActionAgent(agent);
  }, []);

  const handleCloseActionSheet = useCallback(() => {
    setActionAgent(null);
  }, []);

  const handleArchiveAgent = useCallback(() => {
    if (!actionAgent || !actionClient) {
      return;
    }
    // Timeout errors are swallowed — the daemon will still process the archive
    void archiveAgent({ serverId: actionAgent.serverId, agentId: actionAgent.id }).catch(() => {});
    setActionAgent(null);
  }, [actionAgent, actionClient, archiveAgent]);

  const handleDeleteAgent = useCallback(async () => {
    if (!actionAgent || !actionClient) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("agentList.deleteSheet.confirmTitle"),
      message: t("agentList.deleteSheet.confirmMessage", { agent: actionAgent.title }),
      confirmLabel: t("agentList.deleteSheet.delete"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteAgent({ serverId: actionAgent.serverId, agentId: actionAgent.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("agentList.deleteSheet.failed"));
    }
    setActionAgent(null);
  }, [actionAgent, actionClient, deleteAgent, t, toast]);

  const handleDeleteAgentPress = useCallback(() => {
    void handleDeleteAgent();
  }, [handleDeleteAgent]);

  // The row's own archive action: no confirmation, because it is reversible and the next click
  // restores. Restoring goes through refreshAgent — the daemon has no unarchive RPC, so the
  // archived session is brought back the same way the agent panel's callout does it.
  const handleToggleArchive = useCallback(
    (agent: AggregatedAgent) => {
      if (agent.archivedAt) {
        const client = useSessionStore.getState().sessions[agent.serverId]?.client ?? null;
        void client?.refreshAgent(agent.id).catch(() => undefined);
        return;
      }
      void archiveAgent({ serverId: agent.serverId, agentId: agent.id }).catch(() => undefined);
    },
    [archiveAgent],
  );

  // Deleting is the one irreversible action here; the row asks in place before calling this.
  const handleDeleteAgentFromRow = useCallback(
    (agent: AggregatedAgent) => {
      void deleteAgent({ serverId: agent.serverId, agentId: agent.id }).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t("agentList.deleteSheet.failed"));
      });
    },
    [deleteAgent, t, toast],
  );

  const flatItems = useMemo((): FlatListItem[] => {
    const buckets = new Map<DateSectionKey, AggregatedAgent[]>();
    for (const agent of agents) {
      const section = deriveDateSectionKey(agent.lastActivityAt);
      const existing = buckets.get(section) ?? [];
      existing.push(agent);
      buckets.set(section, existing);
    }

    const result: FlatListItem[] = [];
    for (const section of DATE_SECTION_ORDER) {
      const data = buckets.get(section);
      if (!data || data.length === 0) {
        continue;
      }
      result.push({ type: "header", key: `header:${section}`, section });
      for (const agent of data) {
        result.push({ type: "agent", key: `${agent.serverId}:${agent.id}`, agent });
      }
    }
    return result;
  }, [agents]);

  const renderItem: ListRenderItem<FlatListItem> = useCallback(
    ({ item }) => {
      if (item.type === "header") {
        return (
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{formatDateSectionLabel(t, item.section)}</Text>
          </View>
        );
      }
      return (
        <SessionRow
          agent={item.agent}
          search={search}
          isMobile={isMobile}
          selectedAgentId={selectedAgentId}
          showAttentionIndicator={showAttentionIndicator}
          showHostColumn={showHostColumn}
          onPress={handleAgentPress}
          onLongPress={handleAgentLongPress}
          onToggleArchive={handleToggleArchive}
          onDeleteAgent={handleDeleteAgentFromRow}
        />
      );
    },
    [
      handleAgentLongPress,
      handleAgentPress,
      handleDeleteAgentFromRow,
      handleToggleArchive,
      isMobile,
      search,
      selectedAgentId,
      showAttentionIndicator,
      showHostColumn,
      t,
    ],
  );

  const keyExtractor = useCallback((item: FlatListItem) => item.key, []);

  const refreshColors = useMemo(
    () => [theme.colors.foregroundMuted],
    [theme.colors.foregroundMuted],
  );
  const sheetContainerStyle = useMemo(
    () => [styles.sheetContainer, { paddingBottom: Math.max(insets.bottom, theme.spacing[6]) }],
    [insets.bottom, theme.spacing],
  );
  const sheetArchiveTextStyle = useMemo(
    () => [styles.sheetArchiveText, isActionDaemonUnavailable && styles.sheetArchiveTextDisabled],
    [isActionDaemonUnavailable],
  );
  const isDeletingActionAgent = actionAgent
    ? isDeletingAgent({ serverId: actionAgent.serverId, agentId: actionAgent.id })
    : false;
  const isActionBusy = isActionDaemonUnavailable || isDeletingActionAgent;
  const sheetTitleText = isActionDaemonUnavailable
    ? t("agentList.archiveSheet.hostOffline")
    : t("agentList.archiveSheet.runningAgent");

  const refreshControl = useMemo(
    () =>
      onRefresh ? (
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.foregroundMuted}
          colors={refreshColors}
        />
      ) : undefined,
    [onRefresh, isRefreshing, theme.colors.foregroundMuted, refreshColors],
  );

  return (
    <>
      <FlatList
        data={flatItems}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={listFooterComponent}
        refreshControl={refreshControl}
      />

      <Modal
        visible={isActionSheetVisible}
        animationType="fade"
        transparent
        onRequestClose={handleCloseActionSheet}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={handleCloseActionSheet} />
          <View style={sheetContainerStyle}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{sheetTitleText}</Text>
            <View style={styles.sheetButtonRow}>
              <Pressable
                style={[styles.sheetButton, styles.sheetCancelButton]}
                onPress={handleCloseActionSheet}
                testID="agent-action-cancel"
              >
                <Text style={styles.sheetCancelText}>{t("common.actions.cancel")}</Text>
              </Pressable>
              <Pressable
                disabled={isActionBusy}
                style={[styles.sheetButton, styles.sheetArchiveButton]}
                onPress={handleArchiveAgent}
                testID="agent-action-archive"
              >
                <Text style={sheetArchiveTextStyle}>{t("agentList.archiveSheet.archive")}</Text>
              </Pressable>
            </View>
            <Pressable
              disabled={isActionBusy}
              style={styles.sheetDeleteButton}
              onPress={handleDeleteAgentPress}
              accessibilityRole="button"
              accessibilityLabel={t("agentList.deleteSheet.delete")}
              testID="agent-action-delete"
            >
              <Text style={styles.sheetDeleteText}>
                {isDeletingActionAgent
                  ? t("agentList.deleteSheet.deleting")
                  : t("agentList.deleteSheet.delete")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6],
    gap: theme.spacing[1],
  },
  sectionHeading: {
    marginTop: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  sectionTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: {
      xs: theme.borderRadius.lg,
      md: 0,
    },
    marginBottom: {
      xs: theme.spacing[1],
      md: 0,
    },
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  rowTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: theme.spacing[2],
    overflow: "hidden",
  },
  agentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 1,
    minWidth: 0,
  },
  providerIconWrap: {
    flexShrink: 0,
  },
  workspaceTitleText: {
    flexShrink: { xs: 1, md: 0 },
    maxWidth: { xs: "100%", md: 320 },
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  rowMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
    marginTop: 2,
  },
  rowTrailing: {
    marginLeft: theme.spacing[2],
  },
  rowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  sessionTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    color: theme.colors.foregroundMuted,
  },
  sessionMetaText: {
    maxWidth: "100%",
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  sessionMetaSeparator: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    opacity: 0.7,
  },
  rowColumns: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing[3],
  },
  columnMeta: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
    width: 132,
  },
  columnMetaFixed: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
    width: 72,
    textAlign: "right" as const,
  },
  columnMetaHost: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
    width: 120,
    marginLeft: theme.spacing[4],
    textAlign: "right" as const,
  },
  /** Model ids are long and uneven; the cell truncates and the tooltip carries the rest. */ columnModel:
    {
      flexShrink: 0,
      width: 160,
    },
  columnModelText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  /** The actions keep their footprint at rest so hovering never shifts the columns. */
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
    flexShrink: 0,
    width: 64,
  },
  rowActionsHidden: {
    opacity: 0,
  },
  rowAction: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  /** The delete tooltip's ref host; the confirm keeps its own padding. */
  rowActionTooltipHost: {
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface2,
    borderTopLeftRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius["2xl"],
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[4],
    gap: theme.spacing[4],
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.3,
  },
  sheetTitle: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  sheetButtonRow: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  sheetButton: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  sheetArchiveButton: {
    backgroundColor: theme.colors.primary,
  },
  sheetArchiveText: {
    color: theme.colors.primaryForeground,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.base,
  },
  sheetArchiveTextDisabled: {
    opacity: 0.5,
  },
  sheetDeleteButton: {
    alignItems: "center",
    paddingVertical: theme.spacing[2],
  },
  sheetDeleteText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  sheetCancelButton: {
    backgroundColor: theme.colors.surface1,
  },
  sheetCancelText: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.semibold,
    fontSize: theme.fontSize.base,
  },
}));
