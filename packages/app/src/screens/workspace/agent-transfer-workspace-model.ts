import type { WorkspaceStructureProject } from "@/projects/workspace-structure";
import { parseWorkspaceStructureKey } from "@/projects/workspace-structure";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";

export interface TransferWorkspaceEntry {
  workspaceId: string;
  label: string;
  /** agent 已经在这里，选择器把它列出来但置灰，而不是藏起来。 */
  isCurrent: boolean;
}

export interface TransferWorkspaceProject {
  viewKey: string;
  projectName: string;
  /** 当前 host 上的项目 id；新建工作区分支用它，不是跨 host 合并后的 viewKey。 */
  projectId: string;
  workspaces: readonly TransferWorkspaceEntry[];
}

export type TransferWorkspaceSelection =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "create"; projectId: string; projectName: string };

/**
 * 把跨 host 合并后的结构收窄成“这个 daemon 上可移动的目标”。
 *
 * 移动是同一 daemon 内的操作，所以只保留在 `serverId` 上有 placement 的项目；每个结构 key
 * 都要解码，再用 `serverId + workspaceId` 在对应 session 的 workspaces Map 里查真实记录。
 * 直接拿结构 key 当 Map key 会查不到。
 */
export function buildTransferWorkspaceProjects(input: {
  projects: readonly WorkspaceStructureProject[];
  serverId: string;
  sessions: Readonly<Record<string, { workspaces: Map<string, WorkspaceDescriptor> } | undefined>>;
  currentWorkspaceId: string | null;
}): TransferWorkspaceProject[] {
  const session = input.sessions[input.serverId];
  const projects: TransferWorkspaceProject[] = [];
  for (const project of input.projects) {
    const placement = project.hosts.find((host) => host.serverId === input.serverId);
    if (!placement) continue;
    const workspaces: TransferWorkspaceEntry[] = [];
    for (const workspaceKey of project.workspaceKeys) {
      const identity = parseWorkspaceStructureKey(workspaceKey);
      if (!identity || identity.serverId !== input.serverId) continue;
      const mapKey = resolveWorkspaceMapKeyByIdentity({
        workspaces: session?.workspaces,
        workspaceId: identity.workspaceId,
      });
      const workspace = mapKey ? session?.workspaces.get(mapKey) : null;
      if (!workspace || workspace.archivingAt) continue;
      workspaces.push({
        workspaceId: workspace.id,
        label: workspace.title ?? workspace.name,
        isCurrent: workspace.id === input.currentWorkspaceId,
      });
    }
    projects.push({
      viewKey: project.viewKey,
      projectName: project.projectName,
      projectId: placement.projectId,
      workspaces,
    });
  }
  return projects;
}
