import { describe, expect, test } from "vitest";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { filterWorkspacesByProjects, resolveProjectVisibility } from "./sidebar-filter-model";

function workspace(workspaceId: string, projectViewKey: string): SidebarWorkspaceEntry {
  return {
    workspaceKey: `host:${workspaceId}`,
    serverId: "host",
    workspaceId,
    projectViewKey,
    projectName: projectViewKey,
    projectRootPath: `/repo/${projectViewKey}`,
    workspaceDirectory: `/repo/${projectViewKey}/${workspaceId}`,
    workspaceDirectoryLabel: workspaceId,
    projectKind: "git",
    workspaceKind: "worktree",
    name: workspaceId,
    title: null,
    pinnedAt: null,
    labels: [],
    currentBranch: "main",
    statusBucket: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    activeAgentCount: 0,
  };
}

const allKeys = new Set(["alpha", "beta"]);

describe("resolveProjectVisibility", () => {
  test("reads an empty stored filter as every project", () => {
    expect(resolveProjectVisibility({ projectFilters: [], availableViewKeys: allKeys })).toEqual({
      kind: "all",
    });
  });

  test("keeps only the keys that still name a project it can see", () => {
    expect(
      resolveProjectVisibility({
        projectFilters: ["alpha", "gone"],
        availableViewKeys: allKeys,
      }),
    ).toEqual({ kind: "selected", keys: ["alpha"] });
  });

  // 存储的键永不删除：只命中未连接主机的筛选必须失效而不是清空侧栏。
  test("goes inert instead of matching nothing", () => {
    expect(
      resolveProjectVisibility({ projectFilters: ["alpha"], availableViewKeys: new Set(["beta"]) }),
    ).toEqual({ kind: "all" });
    expect(
      resolveProjectVisibility({ projectFilters: ["alpha"], availableViewKeys: new Set() }),
    ).toEqual({ kind: "all" });
  });
});

describe("filterWorkspacesByProjects", () => {
  const workspaces = [
    workspace("one", "alpha"),
    workspace("two", "alpha"),
    workspace("three", "beta"),
  ];

  function filtered(projectFilters: string[]) {
    return filterWorkspacesByProjects({ workspaces, projectFilters }).map(
      (entry) => entry.workspaceId,
    );
  }

  test("keeps every workspace when nothing is pinned", () => {
    expect(filtered([])).toEqual(["one", "two", "three"]);
  });

  test("keeps the workspaces of the pinned projects", () => {
    expect(filtered(["alpha"])).toEqual(["one", "two"]);
    expect(filtered(["beta"])).toEqual(["three"]);
    expect(filtered(["alpha", "beta"])).toEqual(["one", "two", "three"]);
  });

  test("keeps nothing for a project with no workspaces", () => {
    expect(filtered(["gamma"])).toEqual([]);
  });
});
