import { z } from "zod";
import type { AgentTaskItem } from "../../../../agent-sdk-types.js";
import type { PiExtension } from "../contract.js";

const Details = z.object({
  action: z.enum(["create", "update", "list", "get", "delete", "clear"]),
  params: z.record(z.string(), z.unknown()),
  nextId: z.number().int(),
  tasks: z.array(
    z.object({
      id: z.number().int(),
      subject: z.string(),
      status: z.enum(["pending", "in_progress", "completed", "deleted"]),
      activeForm: z.string().optional(),
      description: z.string().optional(),
      blockedBy: z.array(z.number().int()).optional(),
      owner: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  error: z.string().optional(),
});

type RpivTodoTask = z.infer<typeof Details>["tasks"][number];

/**
 * rpiv-todo 的任务条目映射成协议里的 AgentTaskItem。
 * 墓碑（deleted）不进任务清单；依赖、owner 与 metadata 一并带上，供 app 的详情页展示。
 */
export function mapRpivTodoTasks(tasks: readonly RpivTodoTask[]): AgentTaskItem[] {
  return tasks.flatMap((task): AgentTaskItem[] => {
    if (task.status === "deleted") return [];
    const item: AgentTaskItem = {
      id: String(task.id),
      text: task.subject,
      status: task.status,
      completed: task.status === "completed",
    };
    if (task.activeForm) item.activeForm = task.activeForm;
    if (task.description) item.description = task.description;
    if (task.blockedBy?.length) item.blockedBy = task.blockedBy;
    if (task.owner) item.owner = task.owner;
    if (task.metadata) item.metadata = task.metadata;
    return [item];
  });
}

export const rpivTodo: PiExtension = {
  id: "rpiv-todo",
  createSession: () => ({
    mapToolCall(call) {
      if (
        call.toolName !== "todo" ||
        call.status !== "completed" ||
        !call.result ||
        typeof call.result === "string"
      )
        return undefined;
      const parsed = Details.safeParse(call.result.details);
      if (!parsed.success) return undefined;
      return {
        timeline: parsed.data.error
          ? []
          : [
              {
                type: "todo",
                items: mapRpivTodoTasks(parsed.data.tasks),
              },
            ],
      };
    },
  }),
};
