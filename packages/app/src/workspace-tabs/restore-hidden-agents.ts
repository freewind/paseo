import type { Agent } from "@/stores/session-store";
import type { WorkspaceTabPlacement } from "@/stores/workspace-layout-actions";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";
import { selectRestorableHiddenAgentIds } from "@/workspace-tabs/agent-visibility";

interface RestoreHiddenAgentsSnapshot {
  hasHydratedAgents: boolean;
  hasHydratedLayout: boolean;
  sessionAgents: Map<string, Agent> | undefined;
  explicitlyHiddenAgentIds: ReadonlySet<string> | undefined;
}

interface RestoreHiddenAgentsInput {
  serverId: string;
  workspaceId: string;
  readSnapshot: () => RestoreHiddenAgentsSnapshot;
  navigateToWorkspace: (input: { serverId: string; workspaceId: string }) => void;
  openTab: (input: {
    workspaceKey: string;
    target: WorkspaceTabTarget;
    intent: "background";
    placement?: WorkspaceTabPlacement;
  }) => string | null;
  focusedPaneId: () => string | null;
}

export function restoreHiddenWorkspaceAgents(input: RestoreHiddenAgentsInput): string[] {
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
  });
  if (!workspaceKey) return [];
  const snapshot = input.readSnapshot();
  if (!snapshot.hasHydratedAgents || !snapshot.hasHydratedLayout) return [];

  const agentIds = selectRestorableHiddenAgentIds({
    hasHydratedAgents: snapshot.hasHydratedAgents,
    sessionAgents: snapshot.sessionAgents,
    workspaceId: input.workspaceId,
    explicitlyHiddenAgentIds: snapshot.explicitlyHiddenAgentIds,
  });
  if (agentIds.length === 0) return [];

  input.navigateToWorkspace({ serverId: input.serverId, workspaceId: input.workspaceId });
  const paneId = input.focusedPaneId();
  const placement: WorkspaceTabPlacement | undefined = paneId
    ? { mode: "prefer", paneId }
    : undefined;
  const openedAgentIds: string[] = [];
  for (const agentId of agentIds) {
    const tabId = input.openTab({
      workspaceKey,
      target: { kind: "agent", agentId },
      intent: "background",
      placement,
    });
    if (tabId) openedAgentIds.push(agentId);
  }
  return openedAgentIds;
}
