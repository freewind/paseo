import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

/**
 * A Markdown transcript of a conversation: every user and assistant message in order, nothing
 * else. Tool calls, reasoning, todos, errors, notifications, compaction, and plugin rows are the
 * run's machinery, not its words; a copied conversation is for reading and pasting elsewhere.
 *
 * Headings stay the fixed English "User" / "Assistant" regardless of the app's display language,
 * so one transcript reads the same for every consumer. Consecutive messages from one role share a
 * heading.
 */
export function buildConversationMarkdown(items: readonly AgentTimelineItem[]): string {
  const sections: { role: "User" | "Assistant"; parts: string[] }[] = [];
  for (const item of items) {
    if (item.type !== "user_message" && item.type !== "assistant_message") continue;
    const role: "User" | "Assistant" = item.type === "user_message" ? "User" : "Assistant";
    const current = sections.at(-1);
    if (current && current.role === role) {
      current.parts.push(item.text);
    } else {
      sections.push({ role, parts: [item.text] });
    }
  }
  return sections
    .map((section) => `## ${section.role}\n\n${section.parts.join("\n\n")}`)
    .join("\n\n");
}
