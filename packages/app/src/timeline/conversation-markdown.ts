import type { AgentTaskSnapshotItem, AgentTimelineItem } from "@getpaseo/protocol/agent-types";

/**
 * 会话的 Markdown 转录：按顺序取每条用户与助手消息，最后附上最近一次任务快照。
 *
 * 工具调用、思考、报错、通知、压缩与插件行是执行过程，不是对话本身；复制出去是为了阅读
 * 和粘贴，这些行只会制造噪音。所以标题固定用英文 "User" / "Assistant" / "Tasks"：同一个
 * 副本在任何语言环境下读起来都一样。同一角色的连续消息共用一个标题。
 */
export function buildConversationMarkdown(
  items: readonly AgentTimelineItem[],
  tasks?: readonly AgentTaskSnapshotItem[],
  options?: { agentTitle?: string | null },
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
  const body = withTaskSection(conversation, tasks);
  return withAgentTitle(body, options?.agentTitle);
}

function withTaskSection(conversation: string, tasks?: readonly AgentTaskSnapshotItem[]): string {
  const taskSection = buildTaskSnapshotSection(tasks);
  if (!taskSection) return conversation;
  return conversation ? `${conversation}\n\n${taskSection}` : taskSection;
}

/**
 * 标题作为纯文本放在副本最前，与正文隔一个空行。不加 `#`：标题是名字不是标题层级，
 * 粘进富文本目标里 `# ...` 会变成一层外来标题。
 */
function withAgentTitle(body: string, agentTitle?: string | null): string {
  const title = agentTitle?.trim();
  if (!title) return body;
  return body ? `${title}\n\n${body}` : title;
}

/**
 * 最近一次任务快照渲染成 Markdown 清单，带上 provider 保留的字段（依赖、owner、metadata）。
 * 只有一份快照，不是状态变更历史。
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
