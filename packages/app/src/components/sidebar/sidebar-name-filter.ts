import type { MatchRange } from "@getpaseo/protocol/search/text-match";

/** A workspace row the name filter can see, flattened from the sidebar entry. */
export interface WorkspaceNameFilterRow {
  workspaceKey: string;
  projectName: string;
  workspaceTitle: string;
  /** The agents the sidebar actually lists under this workspace, in row order. */
  agentIds: readonly string[];
}

/** A single name-search hit for one workspace row. */
export interface WorkspaceNameMatch {
  workspace: WorkspaceNameFilterRow;
  /** Which text the ranges point into. `agent` means the hit lives on the agent row. */
  matchedField: "workspaceTitle" | "projectName" | "agent";
  ranges: readonly MatchRange[];
  /** The first matched agent's id; set only when `matchedField` is `agent`. */
  matchedAgentId?: string;
}

export interface AgentNameMatch {
  ranges: readonly MatchRange[];
}

/**
 * The whole sidebar filtered by one query, in the shape the model consumes.
 *
 * A row appears when it matches, or when a descendant matches. A match owns its
 * whole subtree: a project hit lists every workspace under it and every agent
 * under those; a workspace hit lists all of its agents. An ancestor that is
 * only kept for its matching descendant shows no siblings — the tree narrows
 * to the matching branches. Only the row that matched carries a highlight.
 */
export interface SidebarNameFilterResult {
  projects: readonly FilteredProjectResult[];
  /** Highlight data per visible workspace; present only while the filter is active. */
  workspaces: ReadonlyMap<string, WorkspaceNameMatch>;
  agents: ReadonlyMap<string, AgentNameMatch>;
}

export interface FilteredProjectResult {
  projectViewKey: string;
  /** The project row matched the query itself; highlight its name. */
  matchedRanges: readonly MatchRange[] | null;
}

const EMPTY_PROJECT_RESULTS: readonly FilteredProjectResult[] = [];
const EMPTY_RANGES: readonly MatchRange[] = [];

/**
 * Case-insensitive substring filter over the sidebar's three name fields.
 *
 * An empty (or whitespace-only) query means "no filter": the result carries no
 * rows and callers keep everything. Otherwise only matching rows, their
 * matching subtrees, and the ancestors needed to reach them survive.
 */
export function filterSidebarByName(input: {
  query: string;
  projects: readonly {
    viewKey: string;
    projectName: string;
    workspaces: readonly WorkspaceNameFilterRow[];
  }[];
  agentTitles: ReadonlyMap<string, string>;
}): SidebarNameFilterResult {
  const query = input.query.trim().toLowerCase();
  if (query.length === 0) {
    return {
      projects: EMPTY_PROJECT_RESULTS,
      workspaces: new Map(),
      agents: new Map(),
    };
  }

  const projects: FilteredProjectResult[] = [];
  const workspaces = new Map<string, WorkspaceNameMatch>();
  const agents = new Map<string, AgentNameMatch>();

  for (const project of input.projects) {
    const projectRanges = substringRanges(query, project.projectName);
    const projectMatched = projectRanges !== null;
    let keepProject = projectMatched;

    for (const workspace of project.workspaces) {
      // A project hit keeps its whole subtree: every workspace, and every agent
      // under those workspaces, without a second highlight.
      if (projectMatched) {
        workspaces.set(workspace.workspaceKey, {
          workspace,
          matchedField: "projectName",
          ranges: EMPTY_RANGES,
        });
        markWorkspaceAgentsVisible(workspace, input.agentTitles, agents);
        continue;
      }

      const titleRanges = substringRanges(query, workspace.workspaceTitle);
      if (titleRanges !== null) {
        workspaces.set(workspace.workspaceKey, {
          workspace,
          matchedField: "workspaceTitle",
          ranges: titleRanges,
        });
        markWorkspaceAgentsVisible(workspace, input.agentTitles, agents);
        keepProject = true;
        continue;
      }

      // Only the agents that match survive; siblings stay hidden.
      let firstMatchedAgentId: string | null = null;
      for (const agentId of workspace.agentIds) {
        const title = input.agentTitles.get(agentId);
        if (title === undefined) continue;
        const agentRanges = substringRanges(query, title);
        if (agentRanges === null) continue;
        agents.set(agentId, { ranges: agentRanges });
        firstMatchedAgentId ??= agentId;
      }
      if (firstMatchedAgentId !== null) {
        workspaces.set(workspace.workspaceKey, {
          workspace,
          matchedField: "agent",
          ranges: EMPTY_RANGES,
          matchedAgentId: firstMatchedAgentId,
        });
        keepProject = true;
      }
    }

    if (keepProject) {
      projects.push({
        projectViewKey: project.viewKey,
        matchedRanges: projectMatched ? projectRanges : null,
      });
    }
  }

  return { projects, workspaces, agents };
}

/**
 * A workspace or project hit owns its subtree, so every agent the sidebar lists
 * under it stays visible. Only the query hit highlights; these rows carry none.
 */
function markWorkspaceAgentsVisible(
  workspace: WorkspaceNameFilterRow,
  agentTitles: ReadonlyMap<string, string>,
  agents: Map<string, AgentNameMatch>,
): void {
  for (const agentId of workspace.agentIds) {
    if (!agents.has(agentId) && agentTitles.has(agentId)) {
      agents.set(agentId, { ranges: EMPTY_RANGES });
    }
  }
}

/** Case-insensitive substring ranges, or null when the text does not contain the query. */
function substringRanges(query: string, text: string): MatchRange[] | null {
  if (query.length === 0) return null;
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return null;
  return [{ start: index, length: query.length }];
}

/** Whether a name-search query is active. A whitespace-only query is not. */
export function hasActiveSidebarNameSearch(query: string): boolean {
  return query.trim().length > 0;
}
