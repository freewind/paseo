import type { AgentHistoryStats } from "../messages.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

/** 展示层只需要几句候选就能挑出一句可显示的，多留的正文只是白占带宽。 */
export const RECENT_USER_MESSAGE_LIMIT = 5;

/**
 * 往尾部窗口里追加一条用户消息，超出上限就丢掉最老的一条。条数仍按全量数，
 * 窗口只决定给展示层几句原话。
 */
export function pushRecentUserMessage(window: string[], text: string): void {
  window.push(text);
  if (window.length > RECENT_USER_MESSAGE_LIMIT) {
    window.shift();
  }
}

/**
 * 历史列表要的两个事实只能从 timeline 里数出来。一次遍历同时得出，避免为了
 * 两个字段扫两遍；正文保留原样，清洗与截断是展示层的事，daemon 不做裁剪。
 */
export function computeHistoryStats(items: readonly AgentTimelineItem[]): AgentHistoryStats {
  let userMessageCount = 0;
  const recentUserMessages: string[] = [];

  for (const item of items) {
    if (item.type !== "user_message") {
      continue;
    }
    userMessageCount += 1;
    pushRecentUserMessage(recentUserMessages, item.text);
  }

  return { userMessageCount, recentUserMessages };
}
