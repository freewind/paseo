import { useCallback, useState } from "react";

/**
 * Whether the reader has collapsed a chat's text outline. Collapsing is a
 * reading decision, not a preference: it lives with the chat, is never surfaced in
 * settings, and is keyed by agent so two chats never inherit each other's answer.
 *
 * The map is module state on purpose. The rail remounts whenever the transcript
 * re-renders, and a component-local `useState` would silently undo the collapse
 * that very next render.
 */
const collapsedByAgent = new Map<string, boolean>();

export function useChatOutlineCollapsed(agentId: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => collapsedByAgent.get(agentId) ?? false);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      if (next) {
        collapsedByAgent.set(agentId, true);
      } else {
        collapsedByAgent.delete(agentId);
      }
      return next;
    });
  }, [agentId]);

  return [collapsed, toggle];
}
