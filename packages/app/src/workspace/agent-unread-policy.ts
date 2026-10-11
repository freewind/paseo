import { selectAgentTurnPresentation, type Agent, type SessionState } from "@/stores/session-store";

export function canMarkAgentUnread(input: {
  session: SessionState | undefined;
  agent: Agent | null | undefined;
  workspaceId: string;
}): boolean {
  const { session, agent, workspaceId } = input;
  return Boolean(
    agent &&
    agent.workspaceId === workspaceId &&
    agent.archivedAt == null &&
    (agent.status === "idle" || agent.status === "closed") &&
    !agent.requiresAttention &&
    agent.pendingPermissions.length === 0 &&
    !selectAgentTurnPresentation(session, agent.id).isActive,
  );
}
