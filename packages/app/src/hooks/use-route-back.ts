import { router, useNavigationContainerRef } from "expo-router";
import { useCallback, useSyncExternalStore } from "react";

export interface RouteBack {
  canGoBack: boolean;
  goBack: () => void;
}

/**
 * 提供「当前能否返回」和「返回上一条路由」两个能力。
 *
 * `navigationRef.canGoBack()` 只是一次普通读取，不会因导航变化通知订阅者；
 * 只读它一次，侧栏按钮的历史判断会一直停在首帧。这里改用 useSyncExternalStore
 * 订阅容器事件，让历史变化自动触发重渲染。
 *
 * 容器挂载前 `canGoBack()` 只会 console.error 并返回 undefined，所以读取和
 * 导航前都必须先用 `isReady()` 守卫。
 */
export function useRouteBack(): RouteBack {
  const navigationRef = useNavigationContainerRef();

  const getCanGoBack = useCallback(
    () => (navigationRef.isReady() ? navigationRef.canGoBack() : false),
    [navigationRef],
  );

  // state 覆盖前进/后退的历史变化；ready 覆盖挂载瞬间，否则容器就绪后会漏一次更新。
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribeState = navigationRef.addListener("state", onStoreChange);
      const unsubscribeReady = navigationRef.addListener("ready", onStoreChange);
      return () => {
        unsubscribeState();
        unsubscribeReady();
      };
    },
    [navigationRef],
  );

  const canGoBack = useSyncExternalStore(subscribe, getCanGoBack, getCanGoBack);

  function goBack(): void {
    // 按钮的可用状态来自渲染时刻，而点击发生在之后；期间路由可能已被关闭，
    // 所以点击当下必须重新核对，避免回退到一个不存在的入口。
    if (!navigationRef.isReady() || !navigationRef.canGoBack()) {
      return;
    }
    router.back();
  }

  return { canGoBack, goBack };
}
