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
 * 历史来自 navigation-history-store：每一步都是主 agent chat，同一 workspace
 * 里手动切换 Chat 也算一步——纯路由的 `canGoBack()` 看不到这些切换，而文件、
 * 终端、设置页等其它页面不入历史。跳转由 NavigationHistoryBridge 回放完成，
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
