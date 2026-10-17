import { beforeEach, describe, expect, it } from "vitest";
import type { AgentMemo } from "@getpaseo/protocol/messages";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useSessionStore } from "./session-store";

const SERVER_ID = "memo-server";
const CLIENT = { marker: "memo-test-client" } as unknown as DaemonClient;

beforeEach(() => {
  useSessionStore.getState().initializeSession(SERVER_ID, CLIENT, 1);
});

function memo(id: string, text: string): AgentMemo {
  return { id, text, createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("session store agent memos", () => {
  it("stores per-agent memo lists keyed by agent id", () => {
    const memos = [memo("m1", "first"), memo("m2", "second")];

    useSessionStore.getState().setAgentMemos(SERVER_ID, "agent-1", memos);

    expect(useSessionStore.getState().sessions[SERVER_ID]?.agentMemos.get("agent-1")).toEqual(
      memos,
    );
  });

  it("replaces the whole list on each write, never merges", () => {
    useSessionStore.getState().setAgentMemos(SERVER_ID, "agent-1", [memo("m1", "first")]);

    const replaced = [memo("m3", "replacement")];
    useSessionStore.getState().setAgentMemos(SERVER_ID, "agent-1", replaced);

    expect(useSessionStore.getState().sessions[SERVER_ID]?.agentMemos.get("agent-1")).toEqual(
      replaced,
    );
  });

  it("drops the entry when the list becomes empty", () => {
    useSessionStore.getState().setAgentMemos(SERVER_ID, "agent-1", [memo("m1", "first")]);

    useSessionStore.getState().setAgentMemos(SERVER_ID, "agent-1", []);

    expect(useSessionStore.getState().sessions[SERVER_ID]?.agentMemos.has("agent-1")).toBe(false);
  });
});
