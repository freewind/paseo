import { isTimelineTurnTrigger } from "@getpaseo/protocol/timeline-turn";
import type { AgentTimelineItem } from "./agent-sdk-types.js";
import type { AgentTimelineRow } from "./agent-timeline-store-types.js";

const PROMPT_PREVIEW_MAX_LENGTH = 120;

export interface TimelinePromptIndexEntry {
  seq: number;
  timestamp: string;
  preview: string;
}

export interface TimelinePromptIndex {
  epoch: string;
  prompts: TimelinePromptIndexEntry[];
}

function promptPreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PROMPT_PREVIEW_MAX_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, PROMPT_PREVIEW_MAX_LENGTH - 1)}…`;
}

function promptText(item: AgentTimelineItem): string | null {
  if (!isTimelineTurnTrigger(item)) {
    return null;
  }
  if (item.type === "user_message") {
    return item.text;
  }
  // 时间线要收录所有发给 AI 的输入：主 agent 发来的任务在回放里是带 agentMessage 的
  // tool_call，定时提醒是 name 为 heartbeat 的 tool_call，两者都不是 user_message。
  if (item.type !== "tool_call") {
    return null;
  }
  if (item.agentMessage) {
    return item.agentMessage.text;
  }
  return item.detail.type === "plain_text" ? (item.detail.text ?? null) : null;
}

export function buildTimelinePromptIndex(
  epoch: string,
  rows: readonly AgentTimelineRow[],
): TimelinePromptIndex {
  return {
    epoch,
    prompts: rows.flatMap((row) => {
      const text = promptText(row.item);
      return text === null
        ? []
        : [{ seq: row.seq, timestamp: row.timestamp, preview: promptPreview(text) }];
    }),
  };
}
