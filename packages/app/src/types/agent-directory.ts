import type { AgentHistoryStats } from "@getpaseo/protocol/messages";
import type { Agent } from "@/stores/session-store";

export type AgentDirectoryEntry = Pick<
  Agent,
  | "id"
  | "serverId"
  | "title"
  | "status"
  | "turn"
  | "lastActivityAt"
  | "cwd"
  | "workspaceId"
  | "provider"
  | "model"
  | "parentAgentId"
  | "requiresAttention"
  | "attentionReason"
  | "attentionTimestamp"
  | "archivedAt"
  | "createdAt"
  | "labels"
  | "projectPlacement"
> & {
  pendingPermissionCount?: number;
  /**
   * 历史行独有的统计（用户消息条数与最后一句原话）。实时目录不产出它：活跃会话
   * 的 timeline 在客户端，行内展示的是另一套数据。
   */
  stats?: AgentHistoryStats;
};
