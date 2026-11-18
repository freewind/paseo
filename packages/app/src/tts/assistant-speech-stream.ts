import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";

/**
 * 流式提取器：每条 assistant_message 增量到达，把该回合累计的 markdown
 * 整体转纯文本（与回合结束整段朗读同一套转换），取出比上次多出来的新文本
 * 交给调用方朗读。朗读时机与打断由调用方决定（新内容会打断正在读的旧内容）。
 * 只处理实时内容，绝不从聊天历史里捞回来。
 */

interface PendingSpeech {
  turnId?: string;
  /** 该回合累计的 markdown。 */
  markdown: string;
  /** 已交给调用方朗读的纯文本前缀。 */
  spoken: string;
}

function toSpeech(markdown: string): string {
  const blocks = fromMarkdown(markdown).children.map((block) =>
    block.type === "list"
      ? block.children.map((item) => toString(item, { includeImageAlt: false })).join("\n")
      : toString(block, { includeImageAlt: false }),
  );
  return blocks
    .filter((block) => block.trim().length > 0)
    .join("\n\n")
    .trim();
}

export function createAssistantSpeechStream() {
  const pending = new Map<string, PendingSpeech>();

  /** 累计全文转纯文本，取出尚未朗读的新文本；整段重写（前缀变了）时整体重读。 */
  const drain = (agentId: string): string | null => {
    const entry = pending.get(agentId);
    if (!entry) return null;
    const plain = toSpeech(entry.markdown);
    const isNew = plain.startsWith(entry.spoken);
    const speech = isNew ? plain.slice(entry.spoken.length) : plain;
    if (!speech.trim()) return null;
    entry.spoken = isNew ? entry.spoken + speech : plain;
    return speech.trim();
  };

  return {
    interrupt(agentId: string) {
      pending.delete(agentId);
    },
    /** 每条增量到达，返回新到的可朗读文本；没有新内容时返回 null。 */
    consume(agentId: string, event: AgentStreamEventPayload): string | null {
      if (event.type === "turn_started") {
        pending.delete(agentId);
        return null;
      }
      if (event.type !== "timeline" || event.item.type !== "assistant_message") return null;
      const text = event.item.text;
      if (!text) return null;
      const previous = pending.get(agentId);
      const sameTurn = previous !== undefined && previous.turnId === event.turnId;
      pending.set(agentId, {
        turnId: event.turnId,
        markdown: sameTurn ? previous.markdown + text : text,
        spoken: sameTurn ? previous.spoken : "",
      });
      return drain(agentId);
    },
    /** 回合结束：把还没朗读的尾巴读完。 */
    finish(agentId: string): string | null {
      return drain(agentId);
    },
    clear() {
      pending.clear();
    },
  };
}
