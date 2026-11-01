export interface TransferWorkspaceRecord {
  workspaceId: string;
  cwd: string;
  archivedAt?: string | null;
}

export interface TransferProjectRecord {
  projectId: string;
  rootPath: string;
  archivedAt?: string | null;
}

export interface TransferWorkspaceTargetInput {
  targetWorkspaceId?: string;
  newWorkspace?: { projectId: string; title?: string };
  getWorkspace(workspaceId: string): Promise<TransferWorkspaceRecord | null>;
  getProject(projectId: string): Promise<TransferProjectRecord | null>;
  createWorkspaceAtProjectRoot(input: {
    rootPath: string;
    projectId: string;
    title: string | null;
  }): Promise<TransferWorkspaceRecord>;
}

/**
 * 解析移动目标：已有工作区，或让 daemon 在项目根目录新建一个。二者必须且只能给一个。
 * 归档的工作区/项目一律拒绝；新工作区的标题按 agent 名传下去。抽成纯函数是为了让
 * “目标不存在 / 已归档 / 新建”三条分支可以脱离 Session 单测。
 */
export async function resolveTransferWorkspaceTarget(
  input: TransferWorkspaceTargetInput,
): Promise<TransferWorkspaceRecord> {
  const hasWorkspaceTarget = Boolean(input.targetWorkspaceId);
  const hasNewWorkspace = Boolean(input.newWorkspace);
  if (hasWorkspaceTarget === hasNewWorkspace) {
    throw new Error("Exactly one of targetWorkspaceId or newWorkspace is required");
  }

  if (input.targetWorkspaceId) {
    const workspace = await input.getWorkspace(input.targetWorkspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${input.targetWorkspaceId}`);
    }
    if (workspace.archivedAt) {
      throw new Error(`Workspace is archived: ${input.targetWorkspaceId}`);
    }
    return workspace;
  }

  const newWorkspace = input.newWorkspace;
  if (!newWorkspace) {
    throw new Error("Transfer target could not be resolved");
  }
  const project = await input.getProject(newWorkspace.projectId);
  if (!project || project.archivedAt) {
    throw new Error(`Project not found: ${newWorkspace.projectId}`);
  }
  return input.createWorkspaceAtProjectRoot({
    rootPath: project.rootPath,
    projectId: project.projectId,
    title: newWorkspace.title ?? null,
  });
}
