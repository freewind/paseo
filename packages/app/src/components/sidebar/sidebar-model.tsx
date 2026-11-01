import { useTranslation } from "react-i18next";
import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacesListResult,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import { usePinnedSidebarKeys, type PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSessionStore } from "@/stores/session-store";
import { useAppSettings } from "@/hooks/use-settings";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useShallow } from "zustand/shallow";
import {
  hasActiveSidebarLabelFilter,
  useSidebarViewStore,
  type SidebarGroupMode,
} from "@/stores/sidebar-view-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildSidebarProjection } from "./sidebar-projection";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { type SidebarWorkspaceGroup } from "./sidebar-labels";
import {
  collectLiveProjectKeys,
  filterSidebarByName,
  filterSidebarProjects,
  filterSidebarWorkspaces,
  hasActiveSidebarNameSearch,
  resolveProjectVisibility,
  type SidebarNameFilterResult,
} from "./sidebar-filter-model";
import { agentTabLabel, buildSidebarWorkspaceAgentRows } from "./sidebar-workspace-agent-rows";
import { resolveSidebarWorkspacePrimaryLabel } from "./sidebar-workspace-title";
import {
  hasAuthoritativeWorkspaceLabelCatalog,
  useWorkspaceLabelProjection,
} from "@/workspace-labels";

interface SidebarModel extends SidebarWorkspacesListResult {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  /**
   * Every project the sidebar could show, before any filter narrows it.
   *
   * `projects` is the FILTERED list. A surface that offers a filter picker must read this one, or
   * narrowing the filter deletes the rows that would undo it.
   */
  allProjects: SidebarProjectEntry[];
  /** The project filter as it is actually being applied — see `resolveProjectVisibility`. */
  resolvedProjectFilters: readonly string[];
  /** 只看还有活跃会话的项目。 */
  nonEmptyProjectsOnly: boolean;
  /** 名称搜索的实时查询；空串表示未启用。 */
  nameSearch: string;
  setNameSearch: (value: string) => void;
  hasNameSearch: boolean;
  /** 名称搜索的高亮数据；未启用时各 map 为空。 */
  nameSearchMatches: SidebarNameFilterResult;
  hasProjectsBeforeFilter: boolean;
  groupMode: SidebarGroupMode;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);

/**
 * 名称搜索的高亮数据单独一个 context：行组件订阅它，值只在搜索查询变化时换新对象，
 * 于是普通侧栏变动不会把每一行都重渲染一遍。
 */
interface SidebarNameSearchValue {
  active: boolean;
  matches: SidebarNameFilterResult;
}

const EMPTY_NAME_SEARCH: SidebarNameSearchValue = {
  active: false,
  matches: { projects: [], workspaces: new Map(), agents: new Map() },
};

const SidebarNameSearchContext = createContext<SidebarNameSearchValue | null>(null);

export function useSidebarNameSearch(): SidebarNameSearchValue {
  return useContext(SidebarNameSearchContext) ?? EMPTY_NAME_SEARCH;
}

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const nameSearch = useSidebarViewStore((state) => state.nameSearch);
  const setNameSearch = useSidebarViewStore((state) => state.setNameSearch);
  const hasNameSearch = hasActiveSidebarNameSearch(nameSearch);
  const list = useSidebarWorkspacesList({ enabled: active });
  const showBackground = useSidebarViewStore((state) => state.showBackground);
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const projectFilters = useSidebarViewStore((state) => state.projectFilters);
  const nonEmptyProjectsOnly = useSidebarViewStore((state) => state.nonEmptyProjectsOnly);
  const reconcileLabelFilter = useSidebarViewStore((state) => state.reconcileLabelFilter);
  const { hosts: labelHosts } = useWorkspaceLabelProjection();
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedWorkspaceGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedWorkspaceGroupKeys,
  );
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const pinnedWorkspaceOrder = useSidebarOrderStore((state) => state.pinnedWorkspaceOrder);
  const toggleProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );
  const availableLabelNames = useMemo(
    () => labelHosts.flatMap((host) => host.labels.map((label) => label.name)),
    [labelHosts],
  );
  const hasAuthoritativeLabelCatalog = hasAuthoritativeWorkspaceLabelCatalog(labelHosts);
  useEffect(() => {
    if (!hasAuthoritativeLabelCatalog) return;
    reconcileLabelFilter(availableLabelNames);
  }, [availableLabelNames, hasAuthoritativeLabelCatalog, reconcileLabelFilter]);
  const hasActiveLabelFilter = hasActiveSidebarLabelFilter(labelFilter);
  const projectVisibility = useMemo(
    () =>
      resolveProjectVisibility({
        projectFilters,
        availableViewKeys: new Set(list.projects.map((project) => project.viewKey)),
        nonEmptyProjectsOnly,
      }),
    [nonEmptyProjectsOnly, projectFilters, list.projects],
  );
  const resolvedProjectFilters =
    projectVisibility.kind === "selected" ? projectVisibility.keys : EMPTY_PROJECT_FILTERS;
  // The project filter is deliberately absent from this gate. It reads `projectViewKey`, which
  // lives on the project and the placement, so it can narrow the project list without hydrating
  // anything; the label filter reads `labels`, which only exists on an entry. Hydration opens a
  // live session-store subscription over every workspace on every visible host, so widening this
  // for a filter that does not need it costs a retained-but-inactive sidebar real work.
  const needsWorkspaceEntries = groupMode !== "project" || hasActiveLabelFilter || hasNameSearch;
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || needsWorkspaceEntries,
  );
  const filteredWorkspaceEntriesByKey = useMemo(() => {
    const filtered = filterSidebarWorkspaces({
      workspaces: [...workspaceEntriesByKey.values()],
      projectFilters: resolvedProjectFilters,
      labelFilter,
      showBackground,
    });
    return new Map(filtered.map((workspace) => [workspace.workspaceKey, workspace]));
  }, [showBackground, labelFilter, resolvedProjectFilters, workspaceEntriesByKey]);
  // 名称搜索匹配的是侧栏实际列出的行：agent 来自标签布局，隐藏或关闭的标签没有行可显示，
  // 让它参与匹配只会留下一个没有可见命中的祖先。
  const layoutByWorkspace = useWorkspaceLayoutStore((state) => state.layoutByWorkspace);
  const visibleAgentIdsByWorkspaceKey = useMemo(() => {
    const byWorkspaceKey = new Map<string, string[]>();
    for (const [workspaceKey, layout] of Object.entries(layoutByWorkspace)) {
      byWorkspaceKey.set(
        workspaceKey,
        buildSidebarWorkspaceAgentRows(layout).map((row) => row.agentId),
      );
    }
    return byWorkspaceKey;
  }, [layoutByWorkspace]);
  // agent 标题来自实时 session store。订阅一次（而不是每行一次）：selector 返回 agents map 本身，
  // 配对在下面的 memo 里做；在 selector 里新建对象会随每次 store tick 触发重渲染。
  const agentMapsByServerId = useSessionStore(
    useShallow((state) =>
      list.workspacePlacements.map(
        (placement) => state.sessions[placement.serverId]?.agents ?? null,
      ),
    ),
  );
  // 项目「非空」的判据与工作区行的 `(N)` 数量一致：有一个未归档的根 agent。
  // 关闭的 agent 仍算：侧栏还在渲染它们的标签，此时隐藏整个项目等于藏起筛选声称保留的行。
  const liveWorkspaceKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!nonEmptyProjectsOnly) return keys;
    for (const [index, agents] of agentMapsByServerId.entries()) {
      const serverId = list.workspacePlacements[index]?.serverId;
      if (!serverId || !agents) continue;
      for (const agent of agents.values()) {
        if (agent.archivedAt || agent.parentAgentId || !agent.workspaceId) continue;
        keys.add(`${serverId}:${agent.workspaceId}`);
      }
    }
    return keys;
  }, [agentMapsByServerId, list.workspacePlacements, nonEmptyProjectsOnly]);
  const agentTitlesMap = useMemo(() => {
    const titles = new Map<string, string>();
    for (const agents of agentMapsByServerId) {
      if (!agents) continue;
      for (const [agentId, agent] of agents) {
        if (agent.archivedAt) continue;
        titles.set(agentId, agentTabLabel(agent.title, agentId));
      }
    }
    return titles;
  }, [agentMapsByServerId]);
  const visibleWorkspaceKeys = useMemo(
    () => new Set(filteredWorkspaceEntriesByKey.keys()),
    [filteredWorkspaceEntriesByKey],
  );
  // The two filters prune differently on purpose. The project filter is a membership test on the
  // project itself, so a project you filtered TO survives even with no workspaces — it still owns
  // a header row you can create your first workspace under. The label filter can only ask about
  // workspaces, so a project it empties has nothing left to show.
  // 名称搜索只看主机筛选：项目、标签、非空开关在查询期间不参与，否则搜到一个被它们藏起来的
  // 项目，结果里也不会出现。清空查询后这些开关照旧生效。
  const preFilteredProjects = useMemo(
    () =>
      filterSidebarProjects({
        projects: list.projects,
        visibility: projectVisibility,
        hasActiveLabelFilter,
        showBackground,
        visibleWorkspaceKeys,
        liveProjectKeys: collectLiveProjectKeys({
          projects: list.projects,
          liveWorkspaceKeys,
        }),
      }),
    [
      showBackground,
      hasActiveLabelFilter,
      projectVisibility,
      list.projects,
      liveWorkspaceKeys,
      visibleWorkspaceKeys,
    ],
  );
  const nameFilter = useMemo(
    () =>
      hasNameSearch
        ? filterSidebarByName({
            query: nameSearch,
            projects: list.projects.map((project) => ({
              viewKey: project.viewKey,
              projectName: project.projectName,
              workspaces: project.workspaces.map((workspace) => {
                const entry = workspaceEntriesByKey.get(workspace.workspaceKey);
                return {
                  workspaceKey: workspace.workspaceKey,
                  workspaceTitle: entry
                    ? resolveSidebarWorkspacePrimaryLabel({
                        workspace: entry,
                        workspaceTitleSource,
                      })
                    : "",
                  agentIds:
                    visibleAgentIdsByWorkspaceKey.get(workspace.workspaceKey) ?? EMPTY_AGENT_IDS,
                };
              }),
            })),
            agentTitles: agentTitlesMap,
          })
        : null,
    [
      hasNameSearch,
      nameSearch,
      list.projects,
      agentTitlesMap,
      visibleAgentIdsByWorkspaceKey,
      workspaceEntriesByKey,
      workspaceTitleSource,
    ],
  );
  const filteredProjects = useMemo(
    () =>
      nameFilter
        ? list.projects.filter((project) =>
            nameFilter.projects.some((kept) => kept.projectViewKey === project.viewKey),
          )
        : preFilteredProjects,
    [nameFilter, list.projects, preFilteredProjects],
  );
  const filteredWorkspaceEntriesFinal = useMemo(() => {
    if (!nameFilter) return filteredWorkspaceEntriesByKey;
    // 搜索时从全部工作区里取命中项：项目、标签、非空筛选不参与，否则被它们藏起来的行
    // 即使名字命中也不会出现。
    const next = new Map<string, SidebarWorkspaceEntry>();
    for (const [key, entry] of workspaceEntriesByKey) {
      if (nameFilter.workspaces.has(key)) next.set(key, entry);
    }
    return next;
  }, [nameFilter, filteredWorkspaceEntriesByKey, workspaceEntriesByKey]);
  const pinnedKeys = usePinnedSidebarKeys(filteredProjects);
  const projectionInput = useMemo(
    () => ({
      projects: filteredProjects,
      pinnedKeys,
      pinnedWorkspaceOrder,
      workspaceEntriesByKey: filteredWorkspaceEntriesFinal,
      projectNamesByViewKey: list.projectNamesByViewKey,
      groupMode,
      pinnedCollapsed,
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      t,
    }),
    [
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      groupMode,
      list.projectNamesByViewKey,
      filteredProjects,
      pinnedCollapsed,
      pinnedKeys,
      pinnedWorkspaceOrder,
      filteredWorkspaceEntriesFinal,
      t,
    ],
  );
  const projection = useMemo(() => buildSidebarProjection(projectionInput), [projectionInput]);
  const nameSearchValue = useMemo<SidebarNameSearchValue>(
    () => ({
      active: hasNameSearch,
      matches: {
        projects: nameFilter?.projects ?? EMPTY_PROJECT_MATCHES,
        workspaces: nameFilter?.workspaces ?? EMPTY_WORKSPACE_MATCHES,
        agents: nameFilter?.agents ?? EMPTY_AGENT_MATCHES,
      },
    }),
    [hasNameSearch, nameFilter],
  );
  const value = useMemo(
    () => ({
      ...list,
      projects: filteredProjects,
      allProjects: list.projects,
      resolvedProjectFilters,
      nonEmptyProjectsOnly,
      nameSearch,
      setNameSearch,
      hasNameSearch,
      nameSearchMatches: {
        projects: nameFilter?.projects ?? EMPTY_PROJECT_MATCHES,
        workspaces: nameFilter?.workspaces ?? EMPTY_WORKSPACE_MATCHES,
        agents: nameFilter?.agents ?? EMPTY_AGENT_MATCHES,
      },
      hasProjectsBeforeFilter: list.projects.length > 0,
      workspaceEntriesByKey: filteredWorkspaceEntriesFinal,
      groupMode,
      workspaceGroups: projection.workspaceGroups,
      projectIconTargets: projection.projectIconTargets,
      pinnedGroups: projection.pinnedGroups,
      collapsedProjectKeys,
      toggleProjectCollapsed,
      shortcutModel: projection.shortcutModel,
    }),
    [
      resolvedProjectFilters,
      nonEmptyProjectsOnly,
      nameSearch,
      setNameSearch,
      hasNameSearch,
      nameFilter,
      collapsedProjectKeys,
      groupMode,
      list,
      filteredProjects,
      projection,
      toggleProjectCollapsed,
      filteredWorkspaceEntriesFinal,
    ],
  );

  return (
    <SidebarModelContext.Provider value={value}>
      <SidebarNameSearchContext.Provider value={nameSearchValue}>
        {children}
      </SidebarNameSearchContext.Provider>
    </SidebarModelContext.Provider>
  );
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}

const EMPTY_PROJECT_FILTERS: readonly string[] = [];

const EMPTY_PROJECT_MATCHES: SidebarNameFilterResult["projects"] = [];
const EMPTY_WORKSPACE_MATCHES: SidebarNameFilterResult["workspaces"] = new Map();
const EMPTY_AGENT_MATCHES: SidebarNameFilterResult["agents"] = new Map();
const EMPTY_AGENT_IDS: readonly string[] = [];
