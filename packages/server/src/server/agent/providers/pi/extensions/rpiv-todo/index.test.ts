import { expect, test } from "vitest";
import { capturedToolCall, verifyTaskFixture } from "../task-fixture-test.js";
import { rpivTodo } from "./index.js";

test("rpiv-todo maps captured RPC tasks through live and history", async () => {
  await verifyTaskFixture(new URL("./fixtures/rpc-session.json", import.meta.url), [
    "pending",
    "pending,pending",
    "in_progress,pending",
    "completed,pending",
  ]);
});

test("rpiv-todo declines the example todo result shape", () => {
  const call = capturedToolCall(
    new URL("../pi-example-todo/fixtures/rpc-session.json", import.meta.url),
  );
  expect(rpivTodo.createSession().mapToolCall?.(call)).toBeUndefined();
});

test("rpiv-todo passes a task description through to the timeline", () => {
  const mapping = rpivTodo.createSession().mapToolCall?.({
    callId: "call-description",
    toolName: "todo",
    args: { action: "create", subject: "test" },
    status: "completed",
    result: {
      details: {
        action: "create",
        params: { action: "create", subject: "test", description: "a long body" },
        nextId: 2,
        tasks: [{ id: 1, subject: "test", status: "pending", description: "a long body" }],
      },
    },
  });
  expect(mapping?.timeline).toEqual([
    {
      type: "todo",
      items: [
        {
          id: "1",
          text: "test",
          status: "pending",
          completed: false,
          description: "a long body",
        },
      ],
    },
  ]);
});
