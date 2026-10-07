import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { stripMarkdown } from "../utils/strip-markdown";

/** Live content only: completion consumes a segment, never searches chat history. */
export function createAssistantSpeechSender() {
  const pending = new Map<string, { turnId?: string; messageId?: string; text: string }>();

  return {
    consume(agentId: string, event: AgentStreamEventPayload): string | null {
      if (event.type !== "timeline" || event.item.type !== "assistant_message") return null;
      const { messageId, text } = event.item;
      const previous = pending.get(agentId);
      if (event.assistantMessageComplete) {
        if (!previous || previous.turnId !== event.turnId || previous.messageId !== messageId) {
          return null;
        }
        pending.delete(agentId);
        return stripMarkdown(previous.text) || null;
      }
      if (!text) return null;
      const sameMessage =
        previous && previous.turnId === event.turnId && previous.messageId === messageId;
      pending.set(agentId, {
        turnId: event.turnId,
        messageId,
        text: sameMessage ? previous.text + text : text,
      });
      return null;
    },
    clear() {
      pending.clear();
    },
  };
}
