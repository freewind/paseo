import { useMemo, useRef, useEffect } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore } from "@/stores/session-store";
import { appLog } from "@/utils/app-log";
import {
  areSidebarWorkspaceSessionsEqual,
  buildSidebarWorkspaceEntries,
  selectSidebarWorkspaceSessions,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacePlacement,
  type SidebarWorkspaceSession,
} from "./sidebar-workspaces-view-model";

const EMPTY_ENTRIES = new Map<string, SidebarWorkspaceEntry>();
const EMPTY_SESSIONS: SidebarWorkspaceSession[] = [];
const EMPTY_PENDING_CREATE_ATTEMPTS: Record<string, never> = {};

export function useSidebarWorkspaceEntries(
  placements: readonly SidebarWorkspacePlacement[],
  enabled = true,
): ReadonlyMap<string, SidebarWorkspaceEntry> {
  const serverIds = useMemo(
    () => Array.from(new Set(placements.map((placement) => placement.serverId))),
    [placements],
  );
  const sessions = useStoreWithEqualityFn(
    useSessionStore,
    (state) =>
      enabled ? selectSidebarWorkspaceSessions(state.sessions, serverIds) : EMPTY_SESSIONS,
    areSidebarWorkspaceSessionsEqual,
  );
  const pendingCreateAttempts = useCreateFlowStore((state) =>
    enabled ? state.pendingByDraftId : EMPTY_PENDING_CREATE_ATTEMPTS,
  );
  const previousEntriesRef = useRef<ReadonlyMap<string, SidebarWorkspaceEntry>>(EMPTY_ENTRIES);

  // Collection ownership is intentional: retained sidebars have one cheap
  // subscription to structurally shared indexes, never one session-store
  // subscription per mounted row.
  const entries = useMemo(() => {
    if (!enabled) {
      return previousEntriesRef.current;
    }
    if (placements.length === 0 || sessions.length === 0) {
      previousEntriesRef.current = EMPTY_ENTRIES;
      return EMPTY_ENTRIES;
    }
    const nextEntries = buildSidebarWorkspaceEntries({
      placements,
      sessions,
      pendingCreateAttempts,
      previousEntries: previousEntriesRef.current,
    });
    previousEntriesRef.current = nextEntries;
    return nextEntries;
  }, [enabled, pendingCreateAttempts, placements, sessions]);

  // Log the workspace agent-count badges that are actually visible (>= 2), so the
  // feature's data path is traceable in paseo-app.log. Only fires on count changes.
  const visibleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of entries.values()) {
      if (entry.activeAgentCount >= 2) {
        counts[entry.workspaceKey] = entry.activeAgentCount;
      }
    }
    return counts;
  }, [entries]);
  const previousVisibleCountsRef = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    const previous = previousVisibleCountsRef.current;
    if (previous === null) {
      previousVisibleCountsRef.current = visibleCounts;
      return;
    }
    const changed =
      Object.keys(previous).length !== Object.keys(visibleCounts).length ||
      Object.entries(visibleCounts).some(([key, count]) => previous[key] !== count);
    if (changed) {
      previousVisibleCountsRef.current = visibleCounts;
      appLog("sidebar.agent-count", "visible", visibleCounts);
    }
  }, [visibleCounts]);

  return entries;
}
