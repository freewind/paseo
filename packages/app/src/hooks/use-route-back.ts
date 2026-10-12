import { useSyncExternalStore } from "react";
import { navigationHistoryStore } from "@/stores/navigation-history-store";

export interface RouteBack {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

/**
 * 侧栏历史导航的可用状态与跳转动作。
 *
 * 历史来自 navigation-history-store：它同时记录页面路由和 workspace 内的
 * 活动 tab，所以同 workspace 里手动切换 Chat 也算一步历史——纯路由的
 * `canGoBack()` 看不到这些切换。跳转由 NavigationHistoryBridge 回放完成，
 * 这里只移动历史游标。
 */
export function useRouteBack(): RouteBack {
  const snapshot = useSyncExternalStore(
    navigationHistoryStore.subscribe,
    navigationHistoryStore.getSnapshot,
    navigationHistoryStore.getSnapshot,
  );

  return {
    canGoBack: snapshot.cursor > 0,
    canGoForward: snapshot.cursor >= 0 && snapshot.cursor < snapshot.entries.length - 1,
    goBack: () => {
      navigationHistoryStore.navigateBack();
    },
    goForward: () => {
      navigationHistoryStore.navigateForward();
    },
  };
}
