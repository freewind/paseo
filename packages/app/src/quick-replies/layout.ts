import { resolveSideRailWidth } from "@/agent-stream/chat-outline/text-rail-model";

/**
 * 窗格右侧留缝至少这么宽，才把常用回复立成常驻面板。宽度预算本身复用
 * `resolveSideRailWidth`，这里的下限只是面板自己的可读要求：再窄，一条回复就只剩省略号。
 */
export const QUICK_REPLIES_RAIL_MIN_WIDTH = 180;

/** 右栏只在功能可用、不是紧凑屏、且缝隙宽度够放下一条回复时才立起来。 */
export function shouldShowQuickRepliesRail(input: {
  enabled: boolean;
  compact: boolean;
  paneWidth: number;
  contentMaxWidth: number;
}): boolean {
  if (!input.enabled || input.compact) return false;
  const railWidth = resolveSideRailWidth(input.paneWidth, input.contentMaxWidth);
  return railWidth !== null && railWidth >= QUICK_REPLIES_RAIL_MIN_WIDTH;
}
