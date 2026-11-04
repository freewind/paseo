/**
 * bridge.ts — Paseo 专用写入通道。
 *
 * 为什么需要它：任务状态只活在 pi 进程内（state/store.ts 的会话槽），Paseo 的
 * daemon/app 没有写口，用户就只能看不能改。这里注册一条内部命令，让 daemon 用
 * `prompt("/paseo_todos <base64url payload>")` 触发增删改查：命令不进对话历史，
 * 执行结果通过 `ctx.ui.notify` 带着 marker 回传给 daemon。
 *
 * 持久化：pi 的会话重放只认 `todo` 工具的 toolResult，所以每次改动额外写一条
 * `paseo_todo_state` 自定义条目；state/replay.ts 会把这种条目和 toolResult 一起按
 * 时间顺序比较，取最后一条为准。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyTaskMutation } from "./state/state-reducer.js";
import { commitState, getState, sid } from "./state/store.js";
import { buildToolResult } from "./tool/response-envelope.js";
import type { TaskAction, TaskMutationParams } from "./tool/types.js";

export const PASEO_TODO_COMMAND = "paseo_todos";
export const PASEO_TODO_STATE_ENTRY = "paseo_todo_state";
/** 复用 Paseo 注入扩展已有的命令结果通道，daemon 侧不必新增 marker 处理。 */
const PASEO_COMMAND_RESULT_MARKER = "PASEO_COMMAND_RESULT";

type BridgePayload = TaskMutationParams & { action: TaskAction; requestId?: string };

function decode(raw: string): BridgePayload | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as BridgePayload) : null;
  } catch {
    return null;
  }
}

export function registerPaseoBridgeCommand(pi: ExtensionAPI): void {
  pi.registerCommand(PASEO_TODO_COMMAND, {
    description: "Internal Paseo todo bridge",
    handler: async (args, ctx) => {
      const payload = decode(args.trim());
      if (!payload) {
        ctx.ui.notify(
          `${PASEO_COMMAND_RESULT_MARKER} ${JSON.stringify({ ok: false, error: "bad payload" })}`,
          "error",
        );
        return;
      }
      const sessionId = sid(ctx);
      try {
        // 协议上的任务 id 是字符串（各家 provider 用不同形态），pi 的 reducer 只认数字，
        // 不转会把 update / delete 全部判成「找不到该任务」。
        const params: TaskMutationParams = { ...payload };
        const rawId = (payload as { id?: unknown }).id;
        if (typeof rawId === "string") {
          const numericId = Number(rawId);
          if (Number.isFinite(numericId)) params.id = numericId;
        }
        const result = applyTaskMutation(getState(sessionId), payload.action, params);
        commitState(sessionId, result.state);
        pi.appendEntry(PASEO_TODO_STATE_ENTRY, {
          tasks: result.state.tasks,
          nextId: result.state.nextId,
        });
        const envelope = buildToolResult(payload.action, params, result.state, result.op);
        ctx.ui.notify(
          `${PASEO_COMMAND_RESULT_MARKER} ${JSON.stringify({
            requestId: payload.requestId,
            ok: result.op.kind !== "error",
            ...(result.op.kind === "error"
              ? { error: result.op.message }
              : { result: envelope.details }),
          })}`,
          result.op.kind === "error" ? "error" : "info",
        );
      } catch (error) {
        ctx.ui.notify(
          `${PASEO_COMMAND_RESULT_MARKER} ${JSON.stringify({
            requestId: payload.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })}`,
          "error",
        );
      }
    },
  });
}
