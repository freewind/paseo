import { expect, test } from "vitest";
import type { PiExtensionToolCall } from "../contract.js";
import { capturedToolCall } from "../task-fixture-test.js";
import { freewindTodo } from "./index.js";

const map = (call: PiExtensionToolCall) => freewindTodo.createSession().mapToolCall?.(call);

test("declines rpiv-todo results that do not carry the freewind source marker", () => {
  const call = capturedToolCall(new URL("../rpiv-todo/fixtures/rpc-session.json", import.meta.url));
  expect(map(call)).toBeUndefined();
});

test("claims its own results and carries description, blockedBy, owner and metadata", () => {
  const call = capturedToolCall(new URL("../rpiv-todo/fixtures/rpc-session.json", import.meta.url));
  const mapping = map({
    ...call,
    result: {
      content: [{ type: "text", text: "Updated #1" }],
      details: {
        source: "freewind-todo",
        action: "update",
        params: { id: 1 },
        nextId: 4,
        tasks: [
          {
            id: 1,
            subject: "Ship adapter",
            status: "in_progress",
            activeForm: "Shipping adapter",
            description: "长正文",
            blockedBy: [2],
            owner: "freewind",
            metadata: { pr: 42 },
          },
          { id: 2, subject: "Write docs", status: "pending" },
          { id: 3, subject: "Gone", status: "deleted" },
        ],
      },
    },
  });

  expect(mapping?.timeline).toEqual([
    {
      type: "todo",
      items: [
        {
          id: "1",
          text: "Ship adapter",
          status: "in_progress",
          completed: false,
          activeForm: "Shipping adapter",
          description: "长正文",
          blockedBy: [2],
          owner: "freewind",
          metadata: { pr: 42 },
        },
        { id: "2", text: "Write docs", status: "pending", completed: false },
      ],
    },
  ]);
});
