import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { SidebarLabelFilter } from "@/stores/sidebar-view-store";
import { filterWorkspacesByLabels } from "./sidebar-labels";

/**
 * 侧栏项目可见性的唯一判定：要么全部显示，要么只显示选中的项目。
 *
 * 空的选择列表等于「全部」：项目列表会被主机筛选收窄，冷启动时还是空的，所以不能在存储
 * 侧删除键，只能在读取时判定。选中项全部失效时同样退回「全部」，否则侧栏会一片空白。
 */
export type ProjectVisibility = { kind: "all" } | { kind: "selected"; keys: readonly string[] };

export function resolveProjectVisibility(input: {
  projectFilters: readonly string[];
  availableViewKeys: ReadonlySet<string>;
}): ProjectVisibility {
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
}): SidebarProjectEntry[] {
  const { visibility } = input;
  let projects =
    visibility.kind === "selected"
      ? input.projects.filter((project) => visibility.keys.includes(project.viewKey))
      : input.projects;
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

const ALL_PROJECTS: ProjectVisibility = { kind: "all" };
