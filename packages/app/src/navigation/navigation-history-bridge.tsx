import { router, usePathname, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  canonicalTargetKey,
  navigationHistoryStore,
  type NavigationHistoryEntry,
} from "@/stores/navigation-history-store";
import {
  useWorkspaceLayoutStore,
  type WorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

/**
 * Focused tab target of a workspace, read straight from the layout store. The
 * selector below turns it into a canonical string so `useSyncExternalStore`
 * sees a stable snapshot: tab descriptors are rebuilt on every layout update
 * even when the target itself did not change.
 */
function readActiveTarget(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
): NavigationHistoryEntry["target"] {
  const layout = state.layoutByWorkspace[workspaceKey] ?? null;
  const tabs = state.getWorkspaceTabs(workspaceKey);
  const derived = deriveWorkspacePaneState({
    layout,
    tabs,
    paneId: layout?.focusedPaneId ?? null,
  });
  return derived.activeTab?.descriptor.target ?? null;
}

function applyEntry(entry: NavigationHistoryEntry): void {
  if (entry.serverId && entry.workspaceId) {
    navigateToWorkspace({
      serverId: entry.serverId,
      workspaceId: entry.workspaceId,
      ...(entry.target ? { target: entry.target } : { preserveFocus: true }),
    });
    return;
  }
  router.navigate(entry.pathname as Href);
}

/**
 * Records visited positions (page + focused tab) into the navigation history
 * and performs back/forward replay. Mounted once at the root layout.
 *
 * Recording observes rendered state rather than individual navigation calls so
 * every route into an agent — sidebar, tab bar, notification — lands in the
 * same history. While a replay is in flight, observations are held until the
 * target state appears (see the store), which keeps intermediate states of the
 * jump itself out of the history.
 */
export function NavigationHistoryBridge() {
  const pathname = usePathname();
  const selection = useMemo(() => parseHostWorkspaceRouteFromPathname(pathname), [pathname]);
  const workspaceKey = useMemo(
    () => (selection ? buildWorkspaceTabPersistenceKey(selection) : null),
    [selection],
  );

  // Only the tab focus of the *current* route's workspace is observed, so
  // background workspace layout changes never touch the history.
  const activeTargetKey = useWorkspaceLayoutStore((state) =>
    workspaceKey ? canonicalTargetKey(readActiveTarget(state, workspaceKey)) : null,
  );

  const { replay } = useSyncExternalStore(
    navigationHistoryStore.subscribe,
    navigationHistoryStore.getSnapshot,
    navigationHistoryStore.getSnapshot,
  );

  const latestRef = useRef({ pathname, activeTargetKey });
  latestRef.current = { pathname, activeTargetKey };
  const appliedReplayTokenRef = useRef(0);

  useEffect(() => {
    if (!replay) {
      return;
    }
    if (appliedReplayTokenRef.current === replay.token) {
      return;
    }
    appliedReplayTokenRef.current = replay.token;
    const latest = latestRef.current;
    const alreadyThere =
      latest.pathname === replay.entry.pathname &&
      (latest.activeTargetKey ?? "") === canonicalTargetKey(replay.entry.target);
    if (alreadyThere) {
      return;
    }
    applyEntry(replay.entry);
  }, [replay]);

  useEffect(() => {
    const target = workspaceKey
      ? readActiveTarget(useWorkspaceLayoutStore.getState(), workspaceKey)
      : null;
    navigationHistoryStore.recordNavigation({
      pathname,
      serverId: selection?.serverId ?? null,
      workspaceId: selection?.workspaceId ?? null,
      target,
    });
  }, [pathname, selection, workspaceKey, activeTargetKey]);

  return null;
}
