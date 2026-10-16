import type { AgentTimelineItem, AgentTaskSnapshotItem } from "@getpaseo/protocol/agent-types";

/**
 * A Markdown transcript of a conversation: every user and assistant message in order, then the
 * latest task snapshot when tasks exist. Tool calls, reasoning, errors, notifications,
 * compaction, and plugin rows are the run's machinery, not its words; a copied conversation is
 * for reading and pasting elsewhere.
 *
 * Headings stay the fixed English "User" / "Assistant" / "Tasks" regardless of the app's display
 * language, so one transcript reads the same for every consumer. Consecutive messages from one
 * role share a heading.
 */
export function buildConversationMarkdown(
  items: readonly AgentTimelineItem[],
  tasks?: readonly AgentTaskSnapshotItem[],
): string {
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
  const conversation = sections
    .map((section) => `## ${section.role}\n\n${section.parts.join("\n\n")}`)
    .join("\n\n");
  const taskSection = buildTaskSnapshotSection(tasks);
  if (!taskSection) return conversation;
  return conversation ? `${conversation}\n\n${taskSection}` : taskSection;
}

/**
 * The latest task snapshot as a Markdown checklist: every task with its status and the fields
 * the provider kept (details, dependencies, owner, metadata). One snapshot, not a history of
 * every status change.
 */
function buildTaskSnapshotSection(tasks?: readonly AgentTaskSnapshotItem[]): string | null {
  if (!tasks || tasks.length === 0) return null;
  const lines = tasks.map((task) => renderTaskLine(task));
  return `## Tasks\n\n${lines.join("\n")}`;
}

function renderTaskLine(task: AgentTaskSnapshotItem): string {
  const done = task.completed || task.status === "completed";
  const checkbox = done ? "[x]" : "[ ]";
  const idPrefix = task.id ? `#${task.id} ` : "";
  const statusSuffix = task.status && task.status !== "completed" ? ` (${task.status})` : "";
  const ownerSuffix = task.owner ? ` @${task.owner}` : "";
  const blockedSuffix =
    task.blockedBy && task.blockedBy.length > 0
      ? ` blocked by ${task.blockedBy.map((id) => `#${id}`).join(", ")}`
      : "";
  const metadataSuffix =
    task.metadata && Object.keys(task.metadata).length > 0
      ? ` \`${JSON.stringify(task.metadata)}\``
      : "";
  const head = `- ${checkbox} ${idPrefix}${task.text}${statusSuffix}${ownerSuffix}${blockedSuffix}${metadataSuffix}`;
  const description = task.description?.trim();
  if (!description) return head;
  const indented = description
    .split("\n")
    .map((line) => `  ${line}`.trimEnd())
    .join("\n");
  return `${head}\n${indented}`;
}
