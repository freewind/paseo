export type MobilePanelGestureDirection = -1 | 1;
export type MobilePanelGestureIntent = "activate" | "fail" | "wait";

/**
 * 面板滑动只归屏幕两侧边缘区；屏幕中间一半无论什么尺寸和平台，
 * 都不会因为拖动而打开面板。
 */
export function isOutsidePanelEdge(
  touchStartX: number,
  windowWidth: number,
  direction: MobilePanelGestureDirection,
): boolean {
  "worklet";
  return direction === 1 ? touchStartX > windowWidth / 4 : touchStartX < (windowWidth * 3) / 4;
}

export function resolveMobilePanelGestureIntent(input: {
  deltaX: number;
  deltaY: number;
  direction: MobilePanelGestureDirection;
  openGesturesBlocked: boolean;
}): MobilePanelGestureIntent {
  "worklet";
  if (input.openGesturesBlocked) {
    return "fail";
  }
  const directedDelta = input.deltaX * input.direction;
  const absDeltaX = Math.abs(input.deltaX);
  const absDeltaY = Math.abs(input.deltaY);
  if (directedDelta <= -10 || (absDeltaY > 10 && absDeltaY > absDeltaX)) {
    return "fail";
  }
  if (directedDelta >= 15 && absDeltaX > absDeltaY) {
    return "activate";
  }
  return "wait";
}
