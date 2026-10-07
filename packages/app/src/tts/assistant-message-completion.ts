import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { stripMarkdown } from "../utils/strip-markdown";

/** Live content only: completion consumes a segment, never searches chat history. */
export function createAssistantSpeechSender() {
  const pending = new Map<string, { turnId?: string; messageId?: string; text: string }>();
  const turns = new Map<string, string | undefined>();
  const interruptedTurns = new Map<string, Set<string | undefined>>();

  function interrupt(agentId: string, turnId = turns.get(agentId)) {
    let blocked = interruptedTurns.get(agentId);
    if (!blocked) {
      blocked = new Set();
      interruptedTurns.set(agentId, blocked);
    }
    blocked.add(turnId);
    if (pending.get(agentId)?.turnId === turnId) pending.delete(agentId);
  }

  return {
    interrupt,
    consume(agentId: string, event: AgentStreamEventPayload): string | null {
      if (event.type === "turn_started") {
        if (event.turnId !== undefined && turns.get(agentId) === event.turnId) return null;
        turns.set(agentId, event.turnId);
        // Providers without turn IDs still announce a new generation explicitly.
        if (event.turnId === undefined) interruptedTurns.get(agentId)?.delete(undefined);
        pending.delete(agentId);
        return null;
      }
      if (event.type === "turn_canceled") {
        interrupt(agentId, event.turnId);
        return null;
      }
      if (event.type !== "timeline" || event.item.type !== "assistant_message") return null;
      if (interruptedTurns.get(agentId)?.has(event.turnId)) return null;
      turns.set(agentId, event.turnId);
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
      turns.clear();
      interruptedTurns.clear();
    },
  };
}
