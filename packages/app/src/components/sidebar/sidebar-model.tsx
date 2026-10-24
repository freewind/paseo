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
import {
  filterSidebarByName,
  hasActiveSidebarNameSearch,
  type SidebarNameFilterResult,
} from "./sidebar-name-filter";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildSidebarProjection } from "./sidebar-projection";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { filterWorkspacesByLabels, type SidebarWorkspaceGroup } from "./sidebar-labels";
import { agentTabLabel, buildSidebarWorkspaceAgentRows } from "./sidebar-workspace-agent-rows";
import { resolveSidebarWorkspacePrimaryLabel } from "./sidebar-workspace-title";
import {
  collectLiveProjectKeys,
  filterWorkspacesByProjects,
  resolveActiveProjectFilters,
} from "./sidebar-project-filter";
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
  /** The project filter as it is actually being applied — see `resolveActiveProjectFilters`. */
  resolvedProjectFilters: readonly string[];
  /** Live-only mode: only projects holding a non-archived, non-closed agent. */
  nonEmptyProjectsOnly: boolean;
  hasProjectsBeforeFilter: boolean;
  groupMode: SidebarGroupMode;
  /** Per-row highlight data while the name search is active; empty when it is off. */
  nameSearchMatches: SidebarNameFilterResult;
  /** Whether the name search is active; result-mode rendering keys off this, not the hit counts. */
  hasNameSearch: boolean;
  /** The raw query; empty means the name search is off. */
  nameSearch: string;
  setNameSearch: (value: string) => void;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const {
    settings: { workspaceTitleSource, freewindMode },
  } = useAppSettings();
  const nameSearch = useSidebarViewStore((state) => state.nameSearch);
  const hasNameSearch = hasActiveSidebarNameSearch(nameSearch);
  const list = useSidebarWorkspacesList({
    enabled: active,
    hostFilters: hasNameSearch ? EMPTY_HOST_FILTERS : undefined,
  });
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const projectFilters = useSidebarViewStore((state) => state.projectFilters);
  const nonEmptyProjectsOnly = useSidebarViewStore((state) => state.nonEmptyProjectsOnly);
  const setNameSearch = useSidebarViewStore((state) => state.setNameSearch);
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
  const resolvedProjectFilters = useMemo(
    () =>
      resolveActiveProjectFilters(
        projectFilters,
        new Set(list.projects.map((project) => project.viewKey)),
      ),
    [projectFilters, list.projects],
  );
  const hasActiveProjectFilter = resolvedProjectFilters.length > 0;
  // The live-only mode asks about agents, so it is the only project filter that needs the agent
  // maps; it subscribes to them only while the mode is on.
  const needsAgentMaps = hasNameSearch || nonEmptyProjectsOnly;
  // The project filter is deliberately absent from this gate. It reads `projectViewKey`, which
  // lives on the project and the placement, so it can narrow the project list without hydrating
  // anything; the label filter reads `labels`, which only exists on an entry. Hydration opens a
  // live session-store subscription over every workspace on every visible host, so widening this
  // for a filter that does not need it costs a retained-but-inactive sidebar real work. The name
  // search joins the gate because its agent titles live on hydrated entries.
  const needsWorkspaceEntries = groupMode !== "project" || hasActiveLabelFilter || hasNameSearch;
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || needsWorkspaceEntries,
  );
  // The search matches only what the sidebar lists, so its agent ids come from
  // the tab layout rather than the session store. An agent whose tab is hidden
  // or closed has no row to show, and matching it would keep an ancestor with
  // no visible hit.
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
  const filteredWorkspaceEntriesByKey = useMemo(() => {
    const byProject = filterWorkspacesByProjects({
      workspaces: [...workspaceEntriesByKey.values()],
      projectFilters: resolvedProjectFilters,
    });
    const filtered = filterWorkspacesByLabels({ workspaces: byProject, ...labelFilter });
    return new Map(filtered.map((workspace) => [workspace.workspaceKey, workspace]));
  }, [labelFilter, resolvedProjectFilters, workspaceEntriesByKey]);
  const visibleWorkspaceKeys = useMemo(
    () => new Set(filteredWorkspaceEntriesByKey.keys()),
    [filteredWorkspaceEntriesByKey],
  );
  // The name search is the last filter in the chain: it narrows what the label and project
  // filters already kept, and its parent-keeping rules read the rows this list holds.
  // Agent titles come from the live session store. Subscribing once here (not per row) keeps
  // the filter's cost to one selector; the map is rebuilt when the agents map is replaced.
  // The selector returns the agents maps themselves and the pairing is built in a memo below:
  // a selector that builds fresh objects re-renders on every store tick and spins forever.
  const agentMapsByServerId = useSessionStore(
    useShallow((state) =>
      needsAgentMaps
        ? list.workspacePlacements.map(
            (placement) => state.sessions[placement.serverId]?.agents ?? null,
          )
        : EMPTY_AGENT_MAPS,
    ),
  );
  // A project counts as non-empty when one of its workspaces holds a root agent, the same rule
  // the workspace row uses for its `(N)` count. Closed agents stay in: the sidebar still renders
  // their tabs, so hiding the project around them would hide rows the filter claims to keep.
  const liveWorkspaceKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!nonEmptyProjectsOnly) return keys;
    for (const [index, agents] of agentMapsByServerId.entries()) {
      const serverId = list.workspacePlacements[index]?.serverId;
      if (!serverId || !agents) continue;
      for (const agent of agents.values()) {
        if (agent.archivedAt || agent.parentAgentId || !agent.workspaceId) continue;
        // workspaceKey is `serverId:workspaceId`, the identity the placements already carry.
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
                  projectName: project.projectName,
                  // Match the string the row renders, not the placement's workspace id.
                  workspaceTitle: entry
                    ? resolveSidebarWorkspacePrimaryLabel({
                        workspace: entry,
                        workspaceTitleSource,
                      })
                    : "",
                  agentIds: freewindMode
                    ? (visibleAgentIdsByWorkspaceKey.get(workspace.workspaceKey) ?? EMPTY_AGENT_IDS)
                    : EMPTY_AGENT_IDS,
                };
              }),
            })),
            agentTitles: freewindMode ? agentTitlesMap : EMPTY_AGENT_TITLES,
          })
        : null,
    [
      hasNameSearch,
      freewindMode,
      nameSearch,
      list.projects,
      agentTitlesMap,
      visibleAgentIdsByWorkspaceKey,
      workspaceEntriesByKey,
      workspaceTitleSource,
    ],
  );
  const nameFilteredProjects = useMemo(
    () =>
      nameFilter
        ? list.projects.filter((project) =>
            nameFilter.projects.some((kept) => kept.projectViewKey === project.viewKey),
          )
        : list.projects,
    [nameFilter, list.projects],
  );
  const baseWorkspaceEntriesByKey = hasNameSearch
    ? workspaceEntriesByKey
    : filteredWorkspaceEntriesByKey;
  const nameFilteredWorkspaceEntries = useMemo(() => {
    if (!nameFilter) return baseWorkspaceEntriesByKey;
    const next = new Map<string, SidebarWorkspaceEntry>();
    for (const [key, entry] of baseWorkspaceEntriesByKey) {
      if (nameFilter.workspaces.has(key)) next.set(key, entry);
    }
    return next;
  }, [nameFilter, baseWorkspaceEntriesByKey]);
  // The two filters prune differently on purpose. The project filter is a membership test on the
  // project itself, so a project you filtered TO survives even with no workspaces — it still owns
  // a header row you can create your first workspace under. The label filter can only ask about
  // workspaces, so a project it empties has nothing left to show.
  const filteredProjects = useMemo(() => {
    let projects = nameFilteredProjects;
    if (!hasNameSearch && hasActiveProjectFilter) {
      const included = new Set(resolvedProjectFilters);
      projects = projects.filter((project) => included.has(project.viewKey));
    }
    if (!hasNameSearch && nonEmptyProjectsOnly) {
      // Derived every render: a project reappears the moment a chat starts in it. The first
      // load is exempt because an empty agent map there means "not fetched yet", and filtering
      // on it would blank the sidebar instead of narrowing it.
      const live = collectLiveProjectKeys({ projects, liveWorkspaceKeys });
      projects = list.isInitialLoad
        ? projects
        : projects.filter((project) => live.has(project.viewKey));
    }
    if (!hasNameSearch && hasActiveLabelFilter) {
      projects = projects.flatMap((project) => {
        const workspaces = project.workspaces.filter((workspace) =>
          visibleWorkspaceKeys.has(workspace.workspaceKey),
        );
        return workspaces.length > 0 ? [{ ...project, workspaces }] : [];
      });
    }
    return projects;
  }, [
    hasActiveLabelFilter,
    hasActiveProjectFilter,
    hasNameSearch,
    resolvedProjectFilters,
    nonEmptyProjectsOnly,
    liveWorkspaceKeys,
    list.isInitialLoad,
    nameFilteredProjects,
    visibleWorkspaceKeys,
  ]);
  const pinnedKeys = usePinnedSidebarKeys(filteredProjects);
  const projectionInput = useMemo(
    () => ({
      projects: filteredProjects,
      pinnedKeys,
      pinnedWorkspaceOrder,
      workspaceEntriesByKey: nameFilteredWorkspaceEntries,
      projectNamesByViewKey: list.projectNamesByViewKey,
      groupMode,
      pinnedCollapsed,
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
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
      nameFilteredWorkspaceEntries,
    ],
  );
  const projection = useMemo(() => buildSidebarProjection(projectionInput), [projectionInput]);
  const value = useMemo(
    () => ({
      ...list,
      projects: filteredProjects,
      allProjects: list.projects,
      resolvedProjectFilters,
      nonEmptyProjectsOnly,
      hasProjectsBeforeFilter: list.projects.length > 0,
      workspaceEntriesByKey: nameFilteredWorkspaceEntries,
      groupMode,
      hasNameSearch,
      nameSearch,
      setNameSearch,
      nameSearchMatches: {
        projects: nameFilter?.projects ?? EMPTY_PROJECT_MATCHES,
        workspaces: nameFilter?.workspaces ?? EMPTY_WORKSPACE_MATCHES,
        agents: nameFilter?.agents ?? EMPTY_AGENT_MATCHES,
      },
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
      collapsedProjectKeys,
      groupMode,
      list,
      filteredProjects,
      projection,
      toggleProjectCollapsed,
      nameFilteredWorkspaceEntries,
      nameSearch,
      setNameSearch,
      hasNameSearch,
      nameFilter,
    ],
  );

  return <SidebarModelContext.Provider value={value}>{children}</SidebarModelContext.Provider>;
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}

const EMPTY_PROJECT_MATCHES: SidebarNameFilterResult["projects"] = [];
const EMPTY_WORKSPACE_MATCHES: SidebarNameFilterResult["workspaces"] = new Map();
const EMPTY_AGENT_MATCHES: SidebarNameFilterResult["agents"] = new Map();
const EMPTY_AGENT_MAPS: readonly never[] = [];
const EMPTY_AGENT_IDS: readonly string[] = [];
const EMPTY_AGENT_TITLES: ReadonlyMap<string, string> = new Map();
const EMPTY_HOST_FILTERS: readonly string[] = [];
