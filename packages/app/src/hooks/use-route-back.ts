import { router, useRootNavigationState } from "expo-router";

export interface RouteBack {
  canGoBack: boolean;
  goBack: () => void;
}

/**
 * 提供「当前能否返回」和「返回上一条路由」两个能力。
 *
 * `router.canGoBack()` 只是一次普通读取，不会因导航变化通知订阅者；
 * 若只读它一次，侧栏按钮的历史判断会一直停留在首帧。订阅根导航状态后，
 * 每次历史变化都会触发重渲染，从而重新读取真实结果。
 */
export function useRouteBack(): RouteBack {
  const rootNavigationState = useRootNavigationState();

  // 根容器挂载前没有可依据的历史，先按不可返回处理。
  const isNavigationReady = Boolean(rootNavigationState?.key);
  const canGoBack = isNavigationReady && router.canGoBack();

  function goBack(): void {
    // 按钮的可用状态来自渲染时刻，而点击发生在之后；期间路由可能已被
    // 关闭，所以点击当下必须重新核对，避免回退到一个不存在的入口。
    if (!router.canGoBack()) {
      return;
    }
    router.back();
  }

  return { canGoBack, goBack };
}
