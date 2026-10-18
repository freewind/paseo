import type { MatchRange } from "@getpaseo/protocol/search/text-match";

/** A workspace row the name filter can see, flattened from the sidebar entry. */
export interface WorkspaceNameFilterRow {
  workspaceKey: string;
  projectName: string;
  workspaceTitle: string;
  agentIds: readonly string[];
}

/** A single name-search hit for one workspace row. */
export interface WorkspaceNameMatch {
  workspace: WorkspaceNameFilterRow;
  /** Which text the ranges point into. `agent` means the hit lives on the agent row. */
  matchedField: "workspaceTitle" | "projectName" | "agent";
  ranges: readonly MatchRange[];
  /** The matched agent's id; set only when `matchedField` is `agent`. */
  matchedAgentId?: string;
}

export interface AgentNameMatch {
  ranges: readonly MatchRange[];
}

/**
 * The whole sidebar filtered by one query, in the shape the model consumes.
 *
 * Only rows that match, or that must stay visible so a match does not float
 * free, are present. An agent match keeps its workspace row; a workspace match
 * keeps its project header. A project match keeps that project's every
 * workspace — "parent matched, children hidden" is how a project hit reads — and
 * only the project row carries the highlight: its ranges index the project name,
 * so handing them to a workspace title would mark the wrong characters.
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
 * rows and callers keep everything. Otherwise only matched rows and their
 * necessary parents survive.
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
      const workspaceMatch = matchWorkspace({
        query,
        workspace,
        projectMatched,
        agentTitles: input.agentTitles,
        agents,
      });

      if (workspaceMatch) {
        workspaces.set(workspace.workspaceKey, workspaceMatch);
        keepProject = true;
        markWorkspaceAgentsVisible(workspace, input.agentTitles, agents);
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
 * Agents under a visible workspace stay visible so their own rows can be
 * navigated; only the query hit highlights.
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

function matchWorkspace(input: {
  query: string;
  workspace: WorkspaceNameFilterRow;
  projectMatched: boolean;
  agentTitles: ReadonlyMap<string, string>;
  agents: Map<string, AgentNameMatch>;
}): WorkspaceNameMatch | null {
  const { workspace } = input;
  if (input.projectMatched) {
    // The project carries the hit; keep the workspace so the project header is not empty. The
    // ranges index the project name, so the workspace row gets none of its own.
    return { workspace, matchedField: "projectName", ranges: EMPTY_RANGES };
  }

  const titleRanges = substringRanges(input.query, workspace.workspaceTitle);
  if (titleRanges !== null) {
    return { workspace, matchedField: "workspaceTitle", ranges: titleRanges };
  }

  for (const agentId of workspace.agentIds) {
    const title = input.agentTitles.get(agentId);
    if (title === undefined) continue;
    const agentRanges = substringRanges(input.query, title);
    if (agentRanges === null) continue;
    input.agents.set(agentId, { ranges: agentRanges });
    return {
      workspace,
      matchedField: "agent",
      ranges: EMPTY_RANGES,
      matchedAgentId: agentId,
    };
  }
  return null;
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
