import { selectAgentTurnPresentation, type Agent, type SessionState } from "@/stores/session-store";

/**
 * 这个 agent 现在能不能被手动标成未读。
 *
 * 规则只写这一份："标签菜单"、"侧栏列表"、"手动标记"这三处的入口都读它，才不会一处能点、另一处不能。
 * 已归档、正在跑回合、在等权限或已经需要关注时都不行——这些状态下「未读」既没有意义，也会与
 * 真实的状态提示打架。
 */
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
