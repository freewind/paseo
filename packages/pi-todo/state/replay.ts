import type { TaskDetails } from "../tool/types.js";
import { EMPTY_STATE, type TaskState } from "./state.js";

/**
 * Discriminator for `details` envelopes that match the persisted `TaskDetails`
 * shape. Defensive — branch entries from older or corrupt sessions are
 * skipped silently.
 */
export function isTaskDetails(value: unknown): value is TaskDetails {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.tasks) && typeof v.nextId === "number";
}

/**
 * Walk the current branch in chronological order; the LAST `toolResult` whose
 * `toolName === "todo"` and whose `details` shape matches `TaskDetails` wins
 * (last-write-wins). When no matching entry exists, returns `EMPTY_STATE`.
 *
 * 移植版新增：Paseo 通过 `/paseo_todos` 命令改任务时不会产生 toolResult，而是写一条
 * `customType === "paseo_todo_state"` 的自定义条目。这种条目和 todo 工具结果同样参与
 * 「取最后一条」的比较，否则命令改过的状态会在重启后回退。
 *
 * Pure of module state — `index.ts` writes the returned snapshot into the
 * store after this returns. The function explicitly does NOT touch the store
 * cell.
 */
export function replayFromBranch(ctx: {
  sessionManager: { getBranch(): Iterable<unknown> };
}): TaskState {
  let result: TaskState = { tasks: [...EMPTY_STATE.tasks], nextId: EMPTY_STATE.nextId };
  for (const entry of ctx.sessionManager.getBranch()) {
    const e = entry as {
      type?: string;
      customType?: string;
      data?: unknown;
      message?: { role?: string; toolName?: string; details?: unknown };
    };
    if (e.type === "custom" && e.customType === "paseo_todo_state") {
      if (!isTaskDetails(e.data)) continue;
      result = {
        tasks: e.data.tasks.map((t) => ({ ...t })),
        nextId: e.data.nextId,
      };
      continue;
    }
    if (e.type !== "message") continue;
    const msg = e.message;
    if (msg?.role !== "toolResult" || msg.toolName !== "todo") continue;
    if (!isTaskDetails(msg.details)) continue;
    result = {
      tasks: msg.details.tasks.map((t) => ({ ...t })),
      nextId: msg.details.nextId,
    };
  }
  return result;
}
