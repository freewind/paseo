import type { AgentHistoryStats } from "../messages.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

/**
 * 历史列表要的两个事实只能从 timeline 里数出来。一次遍历同时得出，避免为了
 * 两个字段扫两遍；最后一句保留完整正文，截断是展示层的事，daemon 不做裁剪。
 */
export function computeHistoryStats(items: readonly AgentTimelineItem[]): AgentHistoryStats {
  let userMessageCount = 0;
  let lastUserMessage: string | null = null;

  for (const item of items) {
    if (item.type !== "user_message") {
      continue;
    }
    userMessageCount += 1;
    lastUserMessage = item.text;
  }

  return { userMessageCount, lastUserMessage };
}
