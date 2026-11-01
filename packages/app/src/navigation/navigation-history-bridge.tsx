import { router, usePathname, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { startNavigationStateSync } from "@/navigation/navigation-state-sync";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  canonicalTargetKey,
  navigationHistoryStore,
  type NavigationHistoryEntry,
} from "@/stores/navigation-history-store";
import {
  useWorkspaceLayoutStore,
  useWorkspaceLayoutStoreHydrated,
  type WorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

interface ActiveWorkspaceTab {
  tabId: string;
  target: WorkspaceTabTarget;
}

/**
 * 直接从布局 store 读取某个工作区聚焦的 tab。下面的 selector 把它转成规范字符串，
 * 让 `useSyncExternalStore` 看到稳定快照：即使 tab 本身没变，tab 描述符在每次
 * 布局更新时也会重建。
 */
export function readActiveTab(
  state: WorkspaceLayoutStore,
  workspaceKey: string,
): ActiveWorkspaceTab | null {
  const layout = state.layoutByWorkspace[workspaceKey] ?? null;
  // 启动时没有布局是常态：水合是异步的，用户没排过版的工作区就没有布局。
  // 这里调 `getWorkspaceTabs` 会现造一个默认布局，其中的空白 tab 每次调用都带新的
  // 随机 id——selector 结果不稳定，React 会一直重渲染直到抛 “Maximum update depth exceeded”。
  if (!layout) {
    return null;
  }
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
 * 聚焦 tab 的稳定快照片段。实例 id 也算在内：两个空白 tab 共用一个目标，
 * 在它们之间切换是历史必须看到的一次移动。
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
 * 把到达 agent chat 的位置（页面 + 聚焦 tab）记进导航历史，并执行前进/后退回放。
 * 只挂在根布局一次。
 *
 * 记录观察的是渲染后的状态，而不是某一次导航调用，所以进入 agent 的每条路
 * ——侧栏、标签行、通知——都会落进同一份历史。非主 agent chat 的位置由 store
 * 丢弃，页面与其它 tab 类型永远不会变成可回退的一步。回放进行中时，观察会
 * 压住，直到目标状态出现（见 store），从而把跳转本身的中间状态挡在历史外。
 */
export function NavigationHistoryBridge() {
  const pathname = usePathname();

  // 历史活得比 tab 久：它存在 daemon 上，启动时恢复一次。
  useEffect(() => startNavigationStateSync(), []);
  const selection = useMemo(() => parseHostWorkspaceRouteFromPathname(pathname), [pathname]);
  const workspaceKey = useMemo(
    () => (selection ? buildWorkspaceTabPersistenceKey(selection) : null),
    [selection],
  );

  // 只观察当前路由所在工作区的 tab 焦点，后台工作区的布局变化不会碰历史。
  const activeTabKey = useWorkspaceLayoutStore((state) =>
    workspaceKey ? activeTabSnapshotKey(readActiveTab(state, workspaceKey)) : null,
  );

  const hasHydratedLayout = useWorkspaceLayoutStoreHydrated();
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
    const latest = latestRef.current;
    // 启动恢复的回放会早于路由与布局就绪：先不消费 token，等落到宿主路由、
    // 布局水合完成后再跳，避免和根重定向抢路由或造出一份默认布局。
    if (!latest.pathname.startsWith("/h/") || !hasHydratedLayout) {
      return;
    }
    appliedReplayTokenRef.current = replay.token;
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
  }, [hasHydratedLayout, pathname, replay]);

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
