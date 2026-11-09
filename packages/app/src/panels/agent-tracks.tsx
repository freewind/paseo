import type { AgentAddress } from "@getpaseo/protocol/addresses";
import { memo, useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ClipboardList } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WorkspaceDiffStatPill } from "@/composer/diff-stat-pill";
import { useWorkspaceHasDiffStat } from "@/composer/workspace-diff-stat";
import { AgentTaskList } from "@/composer/task-list";
import { ComposerTrackBar } from "@/composer/tracks";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usePaneContext } from "@/panels/pane-context";
import { useSettings } from "@/hooks/use-settings";
import { PluginComposerPills } from "@/plugins";
import { useSessionStore } from "@/stores/session-store";
import {
  type ArchiveFinishedStatus,
  useArchiveSubagent,
  useDetachSubagent,
  useSubagentSheetTab,
  type SubagentRow,
} from "@/subagents";
import { ParentAgentPill } from "@/subagents/parent";
import { SubagentsTrack } from "@/subagents/track";
import type { TodoEntry } from "@/types/stream";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";
import { openPreferredWorkspaceTarget } from "@/workspace-tabs/open-beside";
import { openComposerChanges } from "@/workspace-tabs/open-supporting-view";

/**
 * The pane's ambient context — workspace changes, subagents, and tasks — as a row of pills above
 * the composer.
 *
 * The row shares the composer's keyboard transform and owns the space between itself and the
 * transcript. Each pill owns its action while tab placement stays behind the workspace boundary.
 */
export const AgentTracks = memo(function AgentTracks({
  serverId,
  workspaceId,
  agentId,
  parentAgentId,
  subagentRows,
  tasks,
  archiveFinishedStatus,
  onArchiveFinished,
  onArchiveAll,
  hasPluginComposerPills,
  hasMemosEntry,
  onOpenAgentMemos,
  leading,
  trailing,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
  parentAgentId: string | null;
  subagentRows: SubagentRow[];
  tasks: TodoEntry[] | undefined;
  archiveFinishedStatus: ArchiveFinishedStatus;
  onArchiveFinished: () => void;
  onArchiveAll: () => void;
  hasPluginComposerPills: boolean;
  /** 桌面右缝放不下备忘时，这一行给入口。 */
  hasMemosEntry: boolean;
  onOpenAgentMemos: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}): ReactElement | null {
  const { t } = useTranslation();
  const { tabId } = usePaneContext();
  const hasWorkspaceDiffStat = useWorkspaceHasDiffStat(serverId, workspaceId);
  const isCompact = useIsCompactFormFactor();
  const openInSidePane = useSettings((settings) => settings.openInSidePane);
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const canDetachSubagents = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentDetach === true,
  );
  const archiveSubagent = useArchiveSubagent();
  const detachSubagent = useDetachSubagent();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  // 停止与分离都是逐个子代理发请求；运行中的才停，没有可执行的就不显示这些入口。
  const runningRows = useMemo(
    () =>
      subagentRows.filter(
        (row) =>
          row.kind === "paseo" && (row.status === "running" || row.status === "initializing"),
      ),
    [subagentRows],
  );
  const detachableRows = useMemo(
    () => (canDetachSubagents ? subagentRows.filter((row) => row.kind === "paseo") : []),
    [canDetachSubagents, subagentRows],
  );
  const handleStopAll = useCallback(() => {
    if (!client) return;
    for (const row of runningRows) {
      if (row.kind === "paseo") void client.cancelAgent(row.address.agentId).catch(() => undefined);
    }
  }, [client, runningRows]);
  const handleDetachAll = useCallback(() => {
    if (!client) return;
    for (const row of detachableRows) {
      if (row.kind === "paseo") void client.detachAgent(row.address.agentId).catch(() => undefined);
    }
  }, [client, detachableRows]);
  const openSubagentTarget = useCallback(
    (target: WorkspaceTabTarget) => {
      openPreferredWorkspaceTarget({
        workspaceKey,
        target,
        source: "subagents",
        preferences: openInSidePane,
        parentTabId: tabId,
      });
    },
    [openInSidePane, tabId, workspaceKey],
  );
  const handleOpenSubagent = useCallback(
    ({ serverId: targetServerId, agentId: subagentId }: AgentAddress) => {
      const session = useSessionStore.getState().sessions[targetServerId];
      const agent = session?.agents.get(subagentId) ?? session?.agentDetails.get(subagentId);
      // A subagent in another workspace lives in that workspace's tabs.
      if (
        targetServerId !== serverId ||
        (agent?.workspaceId && agent.workspaceId !== workspaceId)
      ) {
        navigateToAgent({ serverId: targetServerId, agentId: subagentId });
        return;
      }
      openSubagentTarget({ kind: "agent", agentId: subagentId });
    },
    [openSubagentTarget, serverId, workspaceId],
  );
  const handleOpenProviderSubagent = useCallback(
    (ownerAgentId: string, subagentId: string) => {
      openSubagentTarget({
        kind: "provider_subagent",
        parentAgentId: ownerAgentId,
        subagentId,
      });
    },
    [openSubagentTarget],
  );
  const sheetTabFor = useSubagentSheetTab(workspaceKey, tabId);
  const handleOpenChanges = useCallback(() => {
    if (!workspaceKey) {
      return;
    }
    openComposerChanges({
      isCompact,
      workspaceKey,
      preferences: openInSidePane,
    });
  }, [isCompact, openInSidePane, workspaceKey]);

  if (
    !hasWorkspaceDiffStat &&
    !leading &&
    !trailing &&
    !hasAgentTracks({
      parentAgentId,
      subagentRows,
      tasks,
      archiveFinishedStatus,
      hasPluginComposerPills,
      hasMemosEntry,
    })
  ) {
    return null;
  }

  return (
    <ComposerTrackBar>
      {leading}
      {parentAgentId ? <ParentAgentPill serverId={serverId} parentAgentId={parentAgentId} /> : null}
      <AgentTaskList tasks={tasks} />
      <SubagentsTrack
        serverId={serverId}
        rows={subagentRows}
        onOpenSubagent={handleOpenSubagent}
        onOpenProviderSubagent={handleOpenProviderSubagent}
        sheetTabFor={sheetTabFor}
        onArchiveSubagent={archiveSubagent}
        onArchiveFinished={onArchiveFinished}
        archiveFinishedStatus={archiveFinishedStatus}
        onArchiveAll={onArchiveAll}
        onStopAll={runningRows.length > 0 ? handleStopAll : undefined}
        onDetachAll={detachableRows.length > 0 ? handleDetachAll : undefined}
        onDetachSubagent={canDetachSubagents ? detachSubagent : undefined}
      />
      <PluginComposerPills
        serverId={serverId}
        workspaceId={workspaceId}
        agentId={agentId}
        compact={isCompact}
      />
      <WorkspaceDiffStatPill
        serverId={serverId}
        workspaceId={workspaceId}
        onPress={handleOpenChanges}
      />
      {hasMemosEntry ? (
        <Button
          variant="ghost"
          size="xs"
          leftIcon={ClipboardList}
          accessibilityLabel={t("agentMemos.toggle")}
          onPress={onOpenAgentMemos}
          testID="composer-agent-memos-button"
        />
      ) : null}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </ComposerTrackBar>
  );
});

const styles = StyleSheet.create({
  trailing: { marginLeft: "auto" },
});

export function hasAgentTracks({
  parentAgentId,
  subagentRows,
  tasks,
  archiveFinishedStatus,
  hasPluginComposerPills = false,
  hasMemosEntry = false,
}: {
  parentAgentId: string | null;
  subagentRows: readonly SubagentRow[];
  tasks: readonly TodoEntry[] | undefined;
  archiveFinishedStatus: ArchiveFinishedStatus;
  hasPluginComposerPills?: boolean;
  hasMemosEntry?: boolean;
}): boolean {
  return (
    parentAgentId !== null ||
    subagentRows.length > 0 ||
    Boolean(tasks?.length) ||
    archiveFinishedStatus.kind !== "idle" ||
    hasPluginComposerPills ||
    hasMemosEntry
  );
}
