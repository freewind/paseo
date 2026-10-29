import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";

/**
 * 流式到达时收集一个回合的回复。不决定何时朗读：调用方在 `turn_completed`
 * 时取走文本。只处理实时内容，绝不从聊天历史里捞回来。
 */
export function createAssistantSpeechSender() {
  const pending = new Map<string, { turnId?: string; text: string }>();

  return {
    interrupt(agentId: string) {
      pending.delete(agentId);
    },
    consume(agentId: string, event: AgentStreamEventPayload): void {
      if (event.type === "turn_started") {
        pending.delete(agentId);
        return;
      }
      if (event.type !== "timeline" || event.item.type !== "assistant_message") return;
      const text = event.item.text;
      if (!text) return;
      const previous = pending.get(agentId);
      const sameTurn = previous !== undefined && previous.turnId === event.turnId;
      pending.set(agentId, {
        turnId: event.turnId,
        text: sameTurn ? previous.text + text : text,
      });
    },
    take(agentId: string, turnId?: string): string | null {
      const collected = pending.get(agentId);
      if (!collected) return null;
      pending.delete(agentId);
      if (turnId !== undefined && collected.turnId !== turnId) return null;
      const blocks = fromMarkdown(collected.text).children.map((block) =>
        block.type === "list"
          ? block.children.map((item) => toString(item, { includeImageAlt: false })).join("\n")
          : toString(block, { includeImageAlt: false }),
      );
      const speech = blocks
        .filter((block) => block.trim().length > 0)
        .join("\n\n")
        .trim();
      return speech || null;
    },
    clear() {
      pending.clear();
    },
  };
}
