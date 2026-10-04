import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentManager } from "./agent-manager.js";
import type {
  AgentClient,
  AgentPersistenceHandle,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
  FetchCatalogOptions,
} from "./agent-sdk-types.js";

const FORK_TEST_CAPABILITIES = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: false,
  supportsModelSelection: false,
  supportsToolInvocations: true,
} as const;

interface ForkTestTurn {
  userId: string;
  userText: string;
  assistantText: string;
}

/**
 * Stands in for a provider with a forking session store: every session keeps the
 * full turn list, and `forkSession` returns a handle for a copy sliced at the
 * boundary entry.
 */
class ForkingSession implements AgentSession {
  readonly provider = "claude" as const;
  readonly capabilities = FORK_TEST_CAPABILITIES;
  readonly id: string;

  private readonly history: ForkTestTurn[];
  private subscribers = new Set<(event: AgentStreamEvent) => void>();

  constructor(sessionId: string, turns: ForkTestTurn[]) {
    this.id = sessionId;
    this.history = turns;
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    for (const turn of this.history) {
      yield {
        type: "timeline",
        provider: this.provider,
        item: { type: "user_message", text: turn.userText, messageId: turn.userId },
      };
      yield {
        type: "timeline",
        provider: this.provider,
        item: { type: "assistant_message", text: turn.assistantText },
      };
    }
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  describePersistence(): AgentPersistenceHandle {
    return { provider: this.provider, sessionId: this.id };
  }

  async close(): Promise<void> {}
}

class ForkingClient implements AgentClient {
  readonly provider = "claude" as const;
  readonly capabilities = FORK_TEST_CAPABILITIES;
  readonly forkCalls: Array<{ sessionId: string; upToMessageId: string }> = [];
  readonly resumeHandles: AgentPersistenceHandle[] = [];
  private nextSession = 0;
  private readonly turns: ForkTestTurn[];
  /** Session slices, the way a provider stores what forkSession produced. */
  private readonly sessions = new Map<string, ForkTestTurn[]>();

  constructor(turns: ForkTestTurn[]) {
    this.turns = turns;
  }

  async createSession(_config: AgentSessionConfig): Promise<AgentSession> {
    const sessionId = `session-${++this.nextSession}`;
    this.sessions.set(sessionId, this.turns);
    return new ForkingSession(sessionId, this.turns);
  }

  async resumeSession(handle: AgentPersistenceHandle): Promise<AgentSession> {
    this.resumeHandles.push(handle);
    const turns = this.sessions.get(handle.sessionId) ?? this.turns;
    return new ForkingSession(handle.sessionId, turns);
  }

  async forkSession(
    handle: AgentPersistenceHandle,
    input: { upToMessageId: string },
  ): Promise<AgentPersistenceHandle> {
    this.forkCalls.push({ sessionId: handle.sessionId, upToMessageId: input.upToMessageId });
    const boundary = this.turns.findIndex((turn) => turn.userId === input.upToMessageId);
    if (boundary < 0) {
      throw new Error(`unknown fork target ${input.upToMessageId}`);
    }
    const sessionId = `forked-${handle.sessionId}-${input.upToMessageId}`;
    this.sessions.set(sessionId, this.turns.slice(0, boundary + 1));
    return {
      provider: this.provider,
      sessionId,
    };
  }

  async fetchCatalog(_options?: FetchCatalogOptions) {
    return { models: [], modes: [] };
  }

  async isAvailable() {
    return true;
  }
}

/** A provider that persists sessions but offers no way to fork them. */
class NonForkingClient implements AgentClient {
  readonly provider = "claude" as const;
  readonly capabilities = FORK_TEST_CAPABILITIES;

  async createSession(_config: AgentSessionConfig): Promise<AgentSession> {
    return new ForkingSession("session-1", TURNS);
  }

  async resumeSession(handle: AgentPersistenceHandle): Promise<AgentSession> {
    return new ForkingSession(handle.sessionId, TURNS);
  }

  async fetchCatalog(_options?: FetchCatalogOptions) {
    return { models: [], modes: [] };
  }

  async isAvailable() {
    return true;
  }
}

async function createForkedAgent(client: ForkingClient) {
  const workdir = mkdtempSync(join(tmpdir(), "agent-fork-test-"));
  const manager = new AgentManager({
    clients: { claude: client },
    logger: createTestLogger(),
  });
  const agent = await manager.createAgent(
    { provider: "claude", cwd: workdir, workspaceId: undefined },
    undefined,
    { workspaceId: undefined },
  );
  // The source agent's timeline only carries boundary rows once its provider
  // history has been hydrated, same as after a daemon restart.
  await manager.hydrateTimelineFromProvider(agent.id, { force: true });
  return { manager, sourceAgentId: agent.id };
}

const TURNS: ForkTestTurn[] = [
  { userId: "user-1", userText: "first", assistantText: "answer one" },
  { userId: "user-2", userText: "second", assistantText: "answer two" },
  { userId: "user-3", userText: "third", assistantText: "answer three" },
];

describe("AgentManager forkAgent", () => {
  test("forks into a new agent id that resumes the provider's forked session", async () => {
    const client = new ForkingClient(TURNS);
    const { manager, sourceAgentId } = await createForkedAgent(client);

    const fork = await manager.forkAgent({
      sourceAgentId,
      boundaryMessageId: "user-1",
    });

    expect(fork.id).not.toBe(sourceAgentId);
    expect(client.forkCalls).toEqual([{ sessionId: "session-1", upToMessageId: "user-1" }]);
    expect(client.resumeHandles.map((handle) => handle.sessionId)).toEqual([
      "forked-session-1-user-1",
    ]);
  });

  test("the fork keeps the source agent and its session untouched", async () => {
    const client = new ForkingClient(TURNS);
    const { manager, sourceAgentId } = await createForkedAgent(client);

    await manager.forkAgent({ sourceAgentId, boundaryMessageId: "user-2" });

    expect(manager.requireAgent(sourceAgentId).session).not.toBeNull();
    expect(manager.getAgent(sourceAgentId)?.persistence?.sessionId).toBe("session-1");
  });

  test("the forked agent replays provider history into its own timeline", async () => {
    const client = new ForkingClient(TURNS);
    const { manager, sourceAgentId } = await createForkedAgent(client);

    const fork = await manager.forkAgent({ sourceAgentId, boundaryMessageId: "user-1" });

    const texts = manager.fetchTimeline(fork.id, { limit: 0 }).rows.map((row) => row.item);
    expect(texts).toEqual([
      { type: "user_message", text: "first", messageId: "user-1" },
      { type: "assistant_message", text: "answer one" },
    ]);
    expect(manager.fetchTimeline(fork.id, { limit: 0 }).epoch).not.toBe(
      manager.fetchTimeline(sourceAgentId, { limit: 0 }).epoch,
    );
  });

  test("surfaces the provider error when the boundary is unknown to it", async () => {
    const client = new ForkingClient(TURNS);
    const { manager, sourceAgentId } = await createForkedAgent(client);

    await expect(manager.forkAgent({ sourceAgentId, boundaryMessageId: "user-9" })).rejects.toThrow(
      /unknown fork target user-9/,
    );
  });

  test("lands the fork in a new workspace when one is supplied", async () => {
    const client = new ForkingClient(TURNS);
    const workdir = mkdtempSync(join(tmpdir(), "agent-fork-test-"));
    const manager = new AgentManager({ clients: { claude: client }, logger: createTestLogger() });
    const source = await manager.createAgent(
      { provider: "claude", cwd: workdir, workspaceId: "workspace-source" },
      undefined,
      { workspaceId: "workspace-source" },
    );
    await manager.hydrateTimelineFromProvider(source.id, { force: true });

    const fork = await manager.forkAgent({
      sourceAgentId: source.id,
      boundaryMessageId: "user-1",
      workspaceId: "workspace-fork",
    });

    expect(fork.workspaceId).toBe("workspace-fork");
    expect(manager.requireAgent(source.id).workspaceId).toBe("workspace-source");
  });

  test("refuses to fork when the provider cannot fork sessions", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-fork-test-"));
    const nonForkingManager = new AgentManager({
      clients: { claude: new NonForkingClient() },
      logger: createTestLogger(),
    });
    const agent = await nonForkingManager.createAgent(
      { provider: "claude", cwd: workdir },
      undefined,
      { workspaceId: undefined },
    );
    await nonForkingManager.hydrateTimelineFromProvider(agent.id, { force: true });

    await expect(
      nonForkingManager.forkAgent({ sourceAgentId: agent.id, boundaryMessageId: "user-1" }),
    ).rejects.toThrow(/does not support forking/);
  });
});
