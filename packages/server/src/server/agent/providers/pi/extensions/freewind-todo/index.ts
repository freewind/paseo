import { z } from "zod";
import type { AgentTaskItem } from "../../../../agent-sdk-types.js";
import type { PiExtension } from "../contract.js";

/**
 * 这份适配器服务的是本地移植版扩展 `freewind-todo`（原名 paseo-pi-todo），
 * 数据形状沿用 @juicesharp/rpiv-todo。两边工具名都是 `todo`、形状也几乎一样，
 * 靠 `details.source` 认领；上游 rpiv 扩展不写这个字段，仍由 `rpiv-todo` 适配器处理。
 */
const Details = z.object({
  source: z.literal("freewind-todo"),
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

type FreewindTodoTask = z.infer<typeof Details>["tasks"][number];

/**
 * freewind-todo 的任务条目映射成协议里的 AgentTaskItem。
 * 墓碑（deleted）不进任务清单；依赖、owner 与 metadata 一并带上，供 app 的详情页展示。
 */
export function mapFreewindTodoTasks(tasks: readonly FreewindTodoTask[]): AgentTaskItem[] {
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

export const freewindTodo: PiExtension = {
  id: "freewind-todo",
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
                items: mapFreewindTodoTasks(parsed.data.tasks),
              },
            ],
      };
    },
  }),
};
