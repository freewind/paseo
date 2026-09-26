import { describe, expect, it } from "vitest";
import { resolveArchiveWorkspaceRisk } from "./use-workspace-header-archive";
import type { WorkspaceDescriptor } from "@/stores/session-store";

function descriptor(partial: Partial<WorkspaceDescriptor>): WorkspaceDescriptor {
  return {
    id: "ws",
    projectId: "p",
    projectDisplayName: "P",
    projectRootPath: "/repo",
    workspaceDirectory: "/repo/ws",
    projectKind: "git",
    workspaceKind: "checkout",
    name: "main",
    title: null,
    pinnedAt: null,
    labels: [],
    status: "running",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
    ...partial,
  };
}

describe("resolveArchiveWorkspaceRisk", () => {
  it("derives worktree archive risk from the git runtime", () => {
    const ws = descriptor({
      workspaceKind: "worktree",
      name: "feature/x",
      gitRuntime: { isDirty: true, aheadOfOrigin: 3 },
      diffStat: { additions: 2, deletions: 1 },
    });
    expect(resolveArchiveWorkspaceRisk(ws)).toEqual({
      workspaceKind: "worktree",
      name: "feature/x",
      isDirty: true,
      aheadOfOrigin: 3,
      diffStat: { additions: 2, deletions: 1 },
    });
  });

  it("falls back to safe defaults when the workspace is absent", () => {
    expect(resolveArchiveWorkspaceRisk(null)).toEqual({
      workspaceKind: "directory",
      name: "",
      isDirty: null,
      aheadOfOrigin: null,
      diffStat: null,
    });
  });
});
