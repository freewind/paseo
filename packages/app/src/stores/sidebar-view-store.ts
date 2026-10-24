import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";
import { z } from "zod";
import { workspaceLabelKey } from "@getpaseo/protocol/workspace-labels";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

export type SidebarGroupMode = "project" | "status";

const SIDEBAR_VIEW_STORAGE_KEY = "sidebar-view";
const LEGACY_SIDEBAR_GROUP_MODE_STORAGE_KEY = "sidebar-group-mode";
const SIDEBAR_VIEW_STORE_VERSION = 6;

/**
 * The key standing for "this workspace carries no labels at all".
 *
 * `normalizeWorkspaceLabelName` trims, so no real label can ever normalize to the empty string
 * and nothing in `labels` can collide with it. That is the whole reason the empty string is the
 * choice: a sentinel like "__unlabelled__" would be a name a person is free to type.
 */
export const SIDEBAR_UNLABELLED_LABEL_KEY = "";

/**
 * What the sidebar's Labels page currently says.
 *
 * The labels pinned to, keyed by `workspaceLabelKey`, exactly as `hostFilters` holds server ids:
 * empty means "every label", non-empty includes workspaces carrying any selected label.
 */
export interface SidebarLabelFilter {
  labels: string[];
}

export function hasActiveSidebarLabelFilter(filter: SidebarLabelFilter): boolean {
  return filter.labels.length > 0;
}

/**
 * Include/exclude toggle over an allowlist, shared by the host and project filters.
 *
 * Both filters answer the same question — "is this one of the things I pinned the sidebar to" —
 * so they share the operation. The label filter does not: its keys go through `workspaceLabelKey`
 * first, which is a different identity.
 */
function toggleFilterEntry(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];
}

interface SidebarViewStoreState {
  groupMode: SidebarGroupMode;
  // Empty means "all hosts". A non-empty list pins the sidebar to those hosts.
  hostFilters: string[];
  /**
   * Empty means "all projects". A non-empty list is an allowlist over
   * `SidebarProjectEntry.viewKey` — the same key the project sections are built from.
   *
   * There is deliberately no `reconcileProjectFilters` counterpart to `reconcileHostFilters`.
   * The project list is narrowed by the host filter and is empty before any host connects, so
   * reconciling against it would silently destroy the filter on every cold start and every
   * host-filter change. Stale keys are resolved away at read time instead — see
   * `resolveActiveProjectFilters`.
   */
  projectFilters: string[];
  /**
   * Show only projects that still hold a live conversation: one of their workspaces has an
   * agent that is neither archived nor closed. Mutually exclusive with `projectFilters` so the
   * list has exactly one reason for hiding a project.
   */
  nonEmptyProjectsOnly: boolean;
  labelFilter: SidebarLabelFilter;
  projectScrollOffset: number;
  statusScrollOffset: number;
  /** Live sidebar name search; intentionally not persisted. */
  nameSearch: string;
  setNameSearch: (value: string) => void;
  setGroupMode: (mode: SidebarGroupMode) => void;
  setProjectScrollOffset: (offset: number) => void;
  setStatusScrollOffset: (offset: number) => void;
  toggleHostFilter: (serverId: string) => void;
  clearHostFilters: () => void;
  toggleProjectFilter: (viewKey: string) => void;
  clearProjectFilters: () => void;
  setNonEmptyProjectsOnly: (enabled: boolean) => void;
  toggleLabelFilter: (name: string) => void;
  clearLabelFilter: () => void;
  reconcileLabelFilter: (labels: readonly string[]) => void;
  reconcileHostFilters: (serverIds: readonly string[]) => void;
}

interface SidebarViewPersistedState {
  groupMode: SidebarGroupMode;
  hostFilters: string[];
  projectFilters: string[];
  nonEmptyProjectsOnly: boolean;
  labelFilter: SidebarLabelFilter;
  projectScrollOffset?: number;
  statusScrollOffset?: number;
}

const PersistedSidebarGroupModeSchema = z.enum(["project", "status", "label"]);
const SidebarLabelFilterSchema = z.object({
  labels: z.array(z.string()),
});
const SidebarViewPersistedStateSchema = z.strictObject({
  groupMode: PersistedSidebarGroupModeSchema.optional(),
  hostFilters: z.array(z.string()).optional(),
  hostFilter: z.string().nullable().optional(),
  projectFilters: z.array(z.string()).optional(),
  nonEmptyProjectsOnly: z.boolean().optional(),
  groupModeByServerId: z.record(z.string(), PersistedSidebarGroupModeSchema).optional(),
  labelFilter: SidebarLabelFilterSchema.optional(),
  projectScrollOffset: z.number().finite().nonnegative().optional(),
  statusScrollOffset: z.number().finite().nonnegative().optional(),
});

type SidebarViewStorageState = z.infer<typeof SidebarViewPersistedStateSchema>;

function readLegacyGroupMode(persistedState: SidebarViewStorageState): SidebarGroupMode | null {
  const groupModeByServerId = persistedState.groupModeByServerId;
  if (!groupModeByServerId) {
    return null;
  }

  const modes = Object.values(groupModeByServerId);
  if (modes.length === 0) return null;
  return modes.includes("status") ? "status" : "project";
}

// Reads the host filter from any persisted shape: the current `hostFilters` array, or the
// pre-v2 single `hostFilter` string (null/absent meant "all hosts").
function readHostFilters(persistedState: SidebarViewStorageState): string[] {
  const hostFilters = persistedState.hostFilters;
  if (hostFilters) {
    return hostFilters;
  }
  // COMPAT(sidebarHostFilters): added in v0.1.102, remove after 2026-12-30 once pre-v2 persisted
  // sidebar state (a single `hostFilter` string) has aged out.
  const legacyHostFilter = persistedState.hostFilter;
  return legacyHostFilter ? [legacyHostFilter] : [];
}

export function migrateSidebarViewState(persistedState: unknown): SidebarViewPersistedState {
  const result = SidebarViewPersistedStateSchema.safeParse(persistedState);
  if (!result.success) {
    return {
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      nonEmptyProjectsOnly: false,
      labelFilter: emptyLabelFilter(),
      projectScrollOffset: 0,
      statusScrollOffset: 0,
    };
  }
  const state = result.data;

  const legacyGroupMode = readLegacyGroupMode(state);
  if (legacyGroupMode) {
    return {
      groupMode: legacyGroupMode,
      hostFilters: [],
      projectFilters: [],
      nonEmptyProjectsOnly: false,
      labelFilter: emptyLabelFilter(),
      projectScrollOffset: 0,
      statusScrollOffset: 0,
    };
  }

  return {
    groupMode: state.groupMode === "status" ? "status" : "project",
    hostFilters: readHostFilters(state),
    projectFilters: state.projectFilters ?? [],
    nonEmptyProjectsOnly: state.nonEmptyProjectsOnly ?? false,
    labelFilter: state.labelFilter
      ? normalizeSidebarLabelFilter(state.labelFilter)
      : emptyLabelFilter(),
    projectScrollOffset: state.projectScrollOffset ?? 0,
    statusScrollOffset: state.statusScrollOffset ?? 0,
  };
}

/**
 * Re-keys a persisted filter through `workspaceLabelKey`, so the invariant on `labels` holds for
 * state that was written by an older build of this page rather than by the current one.
 */
function normalizeSidebarLabelFilter(filter: SidebarLabelFilter): SidebarLabelFilter {
  const labels = new Set(filter.labels.map(workspaceLabelKey));
  return { labels: [...labels] };
}

export function createSidebarViewStorage(
  backingStorage: StateStorage = AsyncStorage,
): StateStorage {
  return {
    getItem: async (name) => {
      const value = await backingStorage.getItem(name);
      if (value !== null || name !== SIDEBAR_VIEW_STORAGE_KEY) {
        return value;
      }
      return backingStorage.getItem(LEGACY_SIDEBAR_GROUP_MODE_STORAGE_KEY);
    },
    setItem: (name, value) => backingStorage.setItem(name, value),
    removeItem: (name) => backingStorage.removeItem(name),
  };
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set) => ({
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      nonEmptyProjectsOnly: false,
      labelFilter: emptyLabelFilter(),
      projectScrollOffset: 0,
      statusScrollOffset: 0,
      nameSearch: "",
      setNameSearch: (value) => set({ nameSearch: value }),
      setGroupMode: (mode) => set({ groupMode: mode }),
      setProjectScrollOffset: (offset) =>
        set({ projectScrollOffset: Number.isFinite(offset) ? Math.max(0, offset) : 0 }),
      setStatusScrollOffset: (offset) =>
        set({ statusScrollOffset: Number.isFinite(offset) ? Math.max(0, offset) : 0 }),
      toggleHostFilter: (serverId) =>
        set((state) => ({ hostFilters: toggleFilterEntry(state.hostFilters, serverId) })),
      clearHostFilters: () => set({ hostFilters: [] }),
      // Picking a project, or going back to every project, cancels the live-only mode: two
      // allowlists over the same list would leave the sidebar unable to explain what it hides.
      toggleProjectFilter: (viewKey) =>
        set((state) => ({
          projectFilters: toggleFilterEntry(state.projectFilters, viewKey),
          nonEmptyProjectsOnly: false,
        })),
      clearProjectFilters: () => set({ projectFilters: [], nonEmptyProjectsOnly: false }),
      setNonEmptyProjectsOnly: (enabled) =>
        set(
          enabled
            ? { projectFilters: [], nonEmptyProjectsOnly: true }
            : { nonEmptyProjectsOnly: false },
        ),
      toggleLabelFilter: (name) =>
        set((state) => {
          const key = workspaceLabelKey(name);
          const labels = state.labelFilter.labels.includes(key)
            ? state.labelFilter.labels.filter((label) => label !== key)
            : [...state.labelFilter.labels, key];
          return { labelFilter: { ...state.labelFilter, labels } };
        }),
      clearLabelFilter: () => set({ labelFilter: emptyLabelFilter() }),
      reconcileLabelFilter: (labels) =>
        set((state) => {
          const available = new Set(labels.map(workspaceLabelKey));
          const next = state.labelFilter.labels.filter(
            (label) => label === SIDEBAR_UNLABELLED_LABEL_KEY || available.has(label),
          );
          if (next.length === state.labelFilter.labels.length) return state;
          return { labelFilter: { labels: next } };
        }),
      reconcileHostFilters: (serverIds) =>
        set((state) => {
          if (state.hostFilters.length === 0) {
            return state;
          }
          const allowed = new Set(serverIds);
          const next = state.hostFilters.filter((id) => allowed.has(id));
          if (next.length === state.hostFilters.length) {
            return state;
          }
          return { hostFilters: next };
        }),
    }),
    {
      name: SIDEBAR_VIEW_STORAGE_KEY,
      version: SIDEBAR_VIEW_STORE_VERSION,
      storage: createValidatedPersistStorage(
        createSidebarViewStorage(),
        SidebarViewPersistedStateSchema,
      ),
      partialize: (state) => ({
        groupMode: state.groupMode,
        hostFilters: state.hostFilters,
        projectFilters: state.projectFilters,
        nonEmptyProjectsOnly: state.nonEmptyProjectsOnly,
        labelFilter: state.labelFilter,
        projectScrollOffset: state.projectScrollOffset,
        statusScrollOffset: state.statusScrollOffset,
      }),
      migrate: migrateSidebarViewState,
    },
  ),
);

function emptyLabelFilter(): SidebarLabelFilter {
  return { labels: [] };
}

/**
 * The single reason the sidebar has for hiding a project. Derived from the two persisted fields so
 * the model, the display-preferences menu, and the filter pipeline all speak one vocabulary.
 */
export type ProjectVisibility =
  | { kind: "all" }
  | { kind: "selected"; keys: readonly string[] }
  | { kind: "non-empty" };

export function resolveProjectVisibility(input: {
  projectFilters: readonly string[];
  nonEmptyProjectsOnly: boolean;
}): ProjectVisibility {
  if (input.nonEmptyProjectsOnly) return { kind: "non-empty" };
  if (input.projectFilters.length > 0) return { kind: "selected", keys: input.projectFilters };
  return { kind: "all" };
}
