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
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

interface ActiveWorkspaceTab {
  tabId: string;
  target: WorkspaceTabTarget;
}

/**
 * Focused tab of a workspace, read straight from the layout store. The selector
 * below turns it into a canonical string so `useSyncExternalStore` sees a stable
 * snapshot: tab descriptors are rebuilt on every layout update even when the tab
 * itself did not change.
 */
function readActiveTab(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
): ActiveWorkspaceTab | null {
  const layout = state.layoutByWorkspace[workspaceKey] ?? null;
  const tabs = state.getWorkspaceTabs(workspaceKey);
  const derived = deriveWorkspacePaneState({
    layout,
    tabs,
    paneId: layout?.focusedPaneId ?? null,
  });
  const activeTab = derived.activeTab;
  if (!activeTab) {
    return null;
  }
  return { tabId: activeTab.descriptor.tabId, target: activeTab.descriptor.target };
}

/**
 * Stable snapshot fragment for the focused tab. The instance id is part of it:
 * two blank tabs share one target, and switching between them is a move the
 * history has to see.
 */
function activeTabSnapshotKey(activeTab: ActiveWorkspaceTab | null): string {
  return activeTab ? `${activeTab.tabId}\u0000${canonicalTargetKey(activeTab.target)}` : "";
}

function applyEntry(entry: NavigationHistoryEntry): void {
  if (entry.serverId && entry.workspaceId) {
    navigateToWorkspace({
      serverId: entry.serverId,
      workspaceId: entry.workspaceId,
      ...(entry.target
        ? { target: entry.target, ...(entry.tabId ? { tabId: entry.tabId } : {}) }
        : { preserveFocus: true }),
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
  const activeTabKey = useWorkspaceLayoutStore((state) =>
    workspaceKey ? activeTabSnapshotKey(readActiveTab(state, workspaceKey)) : null,
  );

  const { replay } = useSyncExternalStore(
    navigationHistoryStore.subscribe,
    navigationHistoryStore.getSnapshot,
    navigationHistoryStore.getSnapshot,
  );

  const latestRef = useRef({ pathname, activeTabKey });
  latestRef.current = { pathname, activeTabKey };
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
    const replayTargetKey = activeTabSnapshotKey(
      replay.entry.tabId && replay.entry.target
        ? { tabId: replay.entry.tabId, target: replay.entry.target }
        : null,
    );
    const alreadyThere =
      latest.pathname === replay.entry.pathname && latest.activeTabKey === replayTargetKey;
    if (alreadyThere) {
      return;
    }
    applyEntry(replay.entry);
  }, [replay]);

  useEffect(() => {
    const activeTab = workspaceKey
      ? readActiveTab(useWorkspaceLayoutStore.getState(), workspaceKey)
      : null;
    navigationHistoryStore.recordNavigation({
      pathname,
      serverId: selection?.serverId ?? null,
      workspaceId: selection?.workspaceId ?? null,
      target: activeTab?.target ?? null,
      tabId: activeTab?.tabId ?? null,
    });
  }, [pathname, selection, workspaceKey, activeTabKey]);

  return null;
}
