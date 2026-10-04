import { describe, expect, it } from "vitest";

import { AgentForkRequestMessageSchema, AgentForkResponseMessageSchema } from "./messages.js";

describe("agent fork messages", () => {
  it("round-trips the fork boundary cursor and workspace target", () => {
    const boundaryCursor = { epoch: "timeline-1", seq: 42 };
    const request = AgentForkRequestMessageSchema.parse({
      type: "agent.fork.request",
      sourceAgentId: "agent-1",
      requestId: "fork-1",
      boundaryCursor,
      targetWorkspace: "new",
    });
    const response = AgentForkResponseMessageSchema.parse({
      type: "agent.fork.response",
      payload: {
        requestId: "fork-1",
        sourceAgentId: "agent-1",
        newAgentId: "agent-2",
        newWorkspaceId: "workspace-2",
        error: null,
      },
    });

    expect(request.boundaryCursor).toEqual(boundaryCursor);
    expect(request.targetWorkspace).toBe("new");
    expect(response.payload.newAgentId).toBe("agent-2");
    expect(response.payload.newWorkspaceId).toBe("workspace-2");
  });

  it("accepts a fork request without a boundary or workspace target", () => {
    const request = AgentForkRequestMessageSchema.parse({
      type: "agent.fork.request",
      sourceAgentId: "agent-1",
      requestId: "fork-2",
    });

    expect(request.boundaryCursor).toBeUndefined();
    expect(request.boundaryMessageId).toBeUndefined();
    expect(request.targetWorkspace).toBeUndefined();
  });

  it("accepts a failed fork response without an agent id", () => {
    expect(
      AgentForkResponseMessageSchema.parse({
        type: "agent.fork.response",
        payload: {
          requestId: "fork-3",
          sourceAgentId: "agent-1",
          newAgentId: null,
          error: "Provider does not support session forking",
        },
      }).payload.newWorkspaceId,
    ).toBeUndefined();
  });
});
