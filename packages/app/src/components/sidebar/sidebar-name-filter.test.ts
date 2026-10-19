import { describe, expect, test } from "vitest";
import {
  filterSidebarByName,
  hasActiveSidebarNameSearch,
  type WorkspaceNameFilterRow,
} from "./sidebar-name-filter";

function workspace(
  workspaceKey: string,
  overrides: Partial<WorkspaceNameFilterRow> = {},
): WorkspaceNameFilterRow {
  return {
    workspaceKey,
    projectName: "Alpha",
    workspaceTitle: workspaceKey,
    agentIds: [],
    ...overrides,
  };
}

function project(viewKey: string, projectName: string, workspaces: WorkspaceNameFilterRow[]) {
  return { viewKey, projectName, workspaces };
}

describe("filterSidebarByName", () => {
  test("empty query keeps everything", () => {
    const result = filterSidebarByName({
      query: "  ",
      projects: [project("p1", "Alpha", [workspace("w1")])],
      agentTitles: new Map(),
    });
    expect(result.projects).toEqual([]);
    expect(result.workspaces.size).toBe(0);
    expect(result.agents.size).toBe(0);
    expect(hasActiveSidebarNameSearch("  ")).toBe(false);
  });

  test("workspace title match keeps its project header", () => {
    const result = filterSidebarByName({
      query: "auth",
      projects: [
        project("p1", "Alpha", [
          workspace("w1", { workspaceTitle: "Add auth flow" }),
          workspace("w2", { workspaceTitle: "Docs" }),
        ]),
      ],
      agentTitles: new Map(),
    });
    expect(result.projects.map((p) => p.projectViewKey)).toEqual(["p1"]);
    expect(result.projects[0].matchedRanges).toBeNull();
    expect(result.workspaces.has("w1")).toBe(true);
    expect(result.workspaces.has("w2")).toBe(false);
  });

  test("matching agent keeps its workspace and only the matched agent row", () => {
    const result = filterSidebarByName({
      query: "lint",
      projects: [
        project("p1", "Alpha", [
          workspace("w1", { workspaceTitle: "Setup", agentIds: ["a1", "a2"] }),
        ]),
      ],
      agentTitles: new Map([
        ["a1", "Fix lint errors"],
        ["a2", "Other"],
      ]),
    });
    expect(result.projects.map((p) => p.projectViewKey)).toEqual(["p1"]);
    const workspaceMatch = result.workspaces.get("w1");
    expect(workspaceMatch?.matchedField).toBe("agent");
    expect(workspaceMatch?.matchedAgentId).toBe("a1");
    expect(result.agents.get("a1")?.ranges).toEqual([{ start: 4, length: 4 }]);
    expect(result.agents.has("a2")).toBe(false);
  });

  test("project match keeps every workspace under it and highlights the project name", () => {
    const result = filterSidebarByName({
      query: "alp",
      projects: [
        project("p1", "Alpha", [workspace("w1"), workspace("w2")]),
        project("p2", "Beta", [workspace("w3")]),
      ],
      agentTitles: new Map(),
    });
    expect(result.projects.map((p) => p.projectViewKey)).toEqual(["p1"]);
    expect(result.projects[0].matchedRanges).toEqual([{ start: 0, length: 3 }]);
    expect(result.workspaces.has("w1")).toBe(true);
    expect(result.workspaces.has("w2")).toBe(true);
    expect(result.workspaces.get("w1")?.matchedField).toBe("projectName");
    expect(result.workspaces.has("w3")).toBe(false);
  });

  test("project match keeps every workspace and every agent under it", () => {
    const result = filterSidebarByName({
      query: "alp",
      projects: [
        project("p1", "Alpha", [
          workspace("w1", { agentIds: ["a1", "a2"] }),
          workspace("w2", { agentIds: ["a3"] }),
        ]),
      ],
      agentTitles: new Map([
        ["a1", "First"],
        ["a2", "Second"],
        ["a3", "Third"],
      ]),
    });
    expect(result.workspaces.has("w1")).toBe(true);
    expect(result.workspaces.has("w2")).toBe(true);
    expect(result.agents.get("a1")?.ranges).toEqual([]);
    expect(result.agents.get("a2")?.ranges).toEqual([]);
    expect(result.agents.get("a3")?.ranges).toEqual([]);
  });

  test("workspace match keeps its agents and hides sibling workspaces", () => {
    const result = filterSidebarByName({
      query: "auth",
      projects: [
        project("p1", "Alpha", [
          workspace("w1", { workspaceTitle: "Add auth flow", agentIds: ["a1", "a2"] }),
          workspace("w2", { workspaceTitle: "Docs", agentIds: ["a3"] }),
        ]),
      ],
      agentTitles: new Map([
        ["a1", "First"],
        ["a2", "Second"],
        ["a3", "Third"],
      ]),
    });
    expect(result.workspaces.has("w1")).toBe(true);
    expect(result.workspaces.has("w2")).toBe(false);
    expect(result.agents.has("a1")).toBe(true);
    expect(result.agents.has("a2")).toBe(true);
    expect(result.agents.has("a3")).toBe(false);
    expect(result.agents.get("a1")?.ranges).toEqual([]);
  });

  test("a project hit still highlights child rows that contain the query", () => {
    const result = filterSidebarByName({
      query: "seo",
      projects: [
        project("p1", "paseo", [
          workspace("w1", { workspaceTitle: "paseo (4)", agentIds: ["a1", "a2"] }),
        ]),
      ],
      agentTitles: new Map([
        ["a1", "seo audit"],
        ["a2", "Other"],
      ]),
    });
    expect(result.projects[0].matchedRanges).toEqual([{ start: 2, length: 3 }]);
    expect(result.workspaces.get("w1")?.ranges).toEqual([{ start: 2, length: 3 }]);
    expect(result.agents.get("a1")?.ranges).toEqual([{ start: 0, length: 3 }]);
    expect(result.agents.get("a2")?.ranges).toEqual([]);
  });

  test("a workspace hit still highlights its agents that contain the query", () => {
    const result = filterSidebarByName({
      query: "auth",
      projects: [
        project("p1", "Alpha", [
          workspace("w1", { workspaceTitle: "Add auth flow", agentIds: ["a1", "a2"] }),
        ]),
      ],
      agentTitles: new Map([
        ["a1", "Auth audit"],
        ["a2", "Docs"],
      ]),
    });
    expect(result.workspaces.get("w1")?.ranges).toEqual([{ start: 4, length: 4 }]);
    expect(result.agents.get("a1")?.ranges).toEqual([{ start: 0, length: 4 }]);
    expect(result.agents.get("a2")?.ranges).toEqual([]);
  });

  test("matching nothing yields empty projects for the caller's empty state", () => {
    const result = filterSidebarByName({
      query: "zzz",
      projects: [project("p1", "Alpha", [workspace("w1")])],
      agentTitles: new Map(),
    });
    expect(result.projects).toEqual([]);
    expect(result.workspaces.size).toBe(0);
  });

  test("matching is case-insensitive", () => {
    const result = filterSidebarByName({
      query: "AUTH",
      projects: [project("p1", "Alpha", [workspace("w1", { workspaceTitle: "Add auth flow" })])],
      agentTitles: new Map(),
    });
    expect(result.workspaces.get("w1")?.ranges).toEqual([{ start: 4, length: 4 }]);
  });

  test("agents without titles are kept visible but never match", () => {
    const result = filterSidebarByName({
      query: "untitled",
      projects: [project("p1", "Alpha", [workspace("w1", { agentIds: ["ghost"] })])],
      agentTitles: new Map(),
    });
    expect(result.projects).toEqual([]);
    expect(result.agents.size).toBe(0);
  });
});
