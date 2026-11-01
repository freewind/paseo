import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { MatchRange } from "@getpaseo/protocol/search/text-match";
import type { SidebarLabelFilter } from "@/stores/sidebar-view-store";
import { filterWorkspacesByLabels } from "./sidebar-labels";

/**
 * 侧栏项目可见性的唯一判定：要么全部显示，要么只显示选中的项目。
 *
 * 本模块只收项目可见性判定与两段过滤链：`groupMode` 属于分组，主机筛选的键清理属于状态
 * 同步，都不往这里塞。
 *
 * 空的选择列表等于「全部」：项目列表会被主机筛选收窄，冷启动时还是空的，所以不能在存储
 * 侧删除键，只能在读取时判定。选中项全部失效时同样退回「全部」，否则侧栏会一片空白。
 */
type ProjectVisibility =
  | { kind: "all" }
  | { kind: "selected"; keys: readonly string[] }
  | { kind: "non-empty" };

export function resolveProjectVisibility(input: {
  projectFilters: readonly string[];
  availableViewKeys: ReadonlySet<string>;
  nonEmptyProjectsOnly?: boolean;
}): ProjectVisibility {
  if (input.nonEmptyProjectsOnly) return NON_EMPTY_PROJECTS;
  if (input.projectFilters.length === 0) return ALL_PROJECTS;
  const matching = input.projectFilters.filter((viewKey) => input.availableViewKeys.has(viewKey));
  return matching.length > 0 ? { kind: "selected", keys: matching } : ALL_PROJECTS;
}

/**
 * 侧栏工作区入口的过滤链：项目选择 → 后台工作区开关 → 标签筛选。
 * 顺序即语义：标签筛选只在前两步留下的集合上判断。
 */
export function filterSidebarWorkspaces(input: {
  workspaces: readonly SidebarWorkspaceEntry[];
  projectFilters: readonly string[];
  labelFilter: SidebarLabelFilter;
  showBackground: boolean;
}): SidebarWorkspaceEntry[] {
  const byProject = filterWorkspacesByProjects({
    workspaces: input.workspaces,
    projectFilters: input.projectFilters,
  });
  return filterWorkspacesByLabels({
    workspaces: byProject.filter((workspace) => input.showBackground || !workspace.background),
    ...input.labelFilter,
  });
}

/**
 * 项目行的过滤：先按项目可见性收窄，再按保留下来的工作区修剪。
 *
 * 两种筛选修剪方式不同。项目选择是项目自身的成员判定，选中的项目即使没有工作区也保留——
 * 它还有一行标题，用户可以在其下创建第一个工作区。标签筛选只能问工作区，被它清空的项目
 * 就没有东西可显示。后台工作区开关同理：只有后台工作区的项目也不该留下。
 */
export function filterSidebarProjects(input: {
  projects: SidebarProjectEntry[];
  visibility: ProjectVisibility;
  hasActiveLabelFilter: boolean;
  showBackground: boolean;
  visibleWorkspaceKeys: ReadonlySet<string>;
  /** 只看非空项目时，仍是活跃状态的项目键；其他可见性下不使用。 */
  liveProjectKeys?: ReadonlySet<string>;
}): SidebarProjectEntry[] {
  const { visibility } = input;
  let projects: SidebarProjectEntry[] = input.projects;
  if (visibility.kind === "selected") {
    projects = projects.filter((project) => visibility.keys.includes(project.viewKey));
  }
  if (visibility.kind === "non-empty") {
    projects = projects.filter((project) => input.liveProjectKeys?.has(project.viewKey) === true);
  }
  if (!input.hasActiveLabelFilter && input.showBackground) return projects;
  projects = projects.flatMap((project) => {
    const workspaces = project.workspaces.filter((workspace) =>
      input.visibleWorkspaceKeys.has(workspace.workspaceKey),
    );
    const keepEmptyProject = !input.hasActiveLabelFilter && project.workspaces.length === 0;
    if (workspaces.length === 0 && !keepEmptyProject) return [];
    return workspaces.length === project.workspaces.length
      ? [project]
      : [{ ...project, workspaces }];
  });
  return projects;
}

/**
 * 项目选择的读取侧：把存储的键与当前可见项目求交。
 *
 * 项目列表被主机筛选收窄，未连接主机上的项目键在读取时消失、主机回来后自动恢复。
 */
export function filterWorkspacesByProjects(input: {
  workspaces: readonly SidebarWorkspaceEntry[];
  projectFilters: readonly string[];
}): SidebarWorkspaceEntry[] {
  const { workspaces, projectFilters } = input;
  if (projectFilters.length === 0) return [...workspaces];
  const included = new Set(projectFilters);
  return workspaces.filter((workspace) => included.has(workspace.projectViewKey));
}

/**
 * 仍有活跃会话的项目：项目下某个工作区带一个未归档的根 agent。
 * 每次渲染重新推导而不是存快照，项目里一开新会话就自动回来，不用重新选择。
 */
export function collectLiveProjectKeys(input: {
  projects: readonly { viewKey: string; workspaces: readonly { workspaceKey: string }[] }[];
  liveWorkspaceKeys: ReadonlySet<string>;
}): Set<string> {
  const keys = new Set<string>();
  for (const project of input.projects) {
    if (
      project.workspaces.some((workspace) => input.liveWorkspaceKeys.has(workspace.workspaceKey))
    ) {
      keys.add(project.viewKey);
    }
  }
  return keys;
}

/** 侧栏名称搜索：命中项目名、工作区标题或 agent 标题即保留该行，并给出高亮区间。 */
interface WorkspaceNameFilterRow {
  workspaceKey: string;
  workspaceTitle: string;
  /** 侧栏实际列出的 agent，按行顺序；隐藏或关闭的标签不在其中。 */
  agentIds: readonly string[];
}

interface WorkspaceNameMatch {
  workspace: WorkspaceNameFilterRow;
  /** ranges 指向哪段文本；`agent` 表示命中落在某个 agent 行上。 */
  matchedField: "workspaceTitle" | "agent";
  ranges: readonly MatchRange[];
  matchedAgentId?: string;
}

interface AgentNameMatch {
  ranges: readonly MatchRange[];
}

/**
 * 一次查询过滤后的整棵侧栏树。
 *
 * 命中的行连它的整棵子树一起保留（项目命中列出其下所有工作区与 agent，工作区命中列出它的
 * 所有 agent）；只为引出后代而保留的祖先不牵扯同级兄弟，树收窄到命中的分支上。只有真正
 * 命中的那一行带高亮。
 */
export interface SidebarNameFilterResult {
  projects: readonly FilteredProjectResult[];
  /** 可见工作区的高亮数据；筛选未启用时为空。 */
  workspaces: ReadonlyMap<string, WorkspaceNameMatch>;
  agents: ReadonlyMap<string, AgentNameMatch>;
}

interface FilteredProjectResult {
  projectViewKey: string;
  /** 项目名本身命中时的高亮区间，否则 null。 */
  matchedRanges: readonly MatchRange[] | null;
}

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
    return { projects: EMPTY_PROJECT_RESULTS, workspaces: new Map(), agents: new Map() };
  }

  const projects: FilteredProjectResult[] = [];
  const workspaces = new Map<string, WorkspaceNameMatch>();
  const agents = new Map<string, AgentNameMatch>();

  for (const project of input.projects) {
    const projectRanges = substringRanges(query, project.projectName);
    const projectMatched = projectRanges !== null;
    let keepProject = projectMatched;

    for (const workspace of project.workspaces) {
      const workspaceRanges = substringRanges(query, workspace.workspaceTitle);
      const workspaceMatched = workspaceRanges !== null;
      if (projectMatched || workspaceMatched) {
        workspaces.set(workspace.workspaceKey, {
          workspace,
          matchedField: workspaceMatched ? "workspaceTitle" : "agent",
          ranges: workspaceMatched ? workspaceRanges : EMPTY_RANGES,
        });
        markWorkspaceAgentsVisible(query, workspace, input.agentTitles, agents, true);
        keepProject = true;
        continue;
      }

      // 只有命中的 agent 留下，同级的兄弟行不显示。
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
 * 命中行保留整棵子树时，子树里的每个 agent 行仍标出自己命中的部分，
 * 这样后代里含查询文本的行是高亮而不是普通上下文。
 */
function markWorkspaceAgentsVisible(
  query: string,
  workspace: WorkspaceNameFilterRow,
  agentTitles: ReadonlyMap<string, string>,
  agents: Map<string, AgentNameMatch>,
  includeAll: boolean,
): void {
  for (const agentId of workspace.agentIds) {
    const title = agentTitles.get(agentId);
    if (title === undefined) continue;
    const ranges = substringRanges(query, title);
    if (!includeAll && ranges === null) continue;
    agents.set(agentId, { ranges: ranges ?? EMPTY_RANGES });
  }
}

/** 大小写不敏感的子串匹配区间；不含查询时返回 null。 */
function substringRanges(query: string, text: string): MatchRange[] | null {
  if (query.length === 0) return null;
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return null;
  return [{ start: index, length: query.length }];
}

/** 名称搜索是否启用；只有空白的查询视为未启用。 */
export function hasActiveSidebarNameSearch(query: string): boolean {
  return query.trim().length > 0;
}

const ALL_PROJECTS: ProjectVisibility = { kind: "all" };
const NON_EMPTY_PROJECTS: ProjectVisibility = { kind: "non-empty" };
const EMPTY_PROJECT_RESULTS: readonly FilteredProjectResult[] = [];
const EMPTY_RANGES: readonly MatchRange[] = [];
