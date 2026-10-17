import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Logger } from "pino";

import { writeJsonFileAtomic } from "../atomic-file.js";
import { AGENT_MEMOS_MAX_PER_AGENT } from "@getpaseo/protocol/agent-memo-limits";
import { AgentMemoSchema, type AgentMemo } from "@getpaseo/protocol/messages";

const AGENT_MEMOS_SCHEMA = z.object({
  version: z.literal(1).default(1),
  memosByAgentId: z.record(z.string(), z.array(AgentMemoSchema)).default({}),
});

type StoredAgentMemos = z.infer<typeof AGENT_MEMOS_SCHEMA>;

const EMPTY_STORE: StoredAgentMemos = { version: 1, memosByAgentId: {} };

/**
 * Server-side per-agent memo storage.
 *
 * Memos are short snippets a user pins to an agent and can click into the composer.
 * They live on the daemon (`$PASEO_HOME/agent-memos.json`) so every client sees the
 * same list; one mutation at a time serializes concurrent clients at the file, and
 * each mutation returns the full list, so clients reconcile by replacement rather
 * than merging divergent orders.
 */
export class AgentMemoStore {
  private readonly filePath: string;
  private readonly logger: Logger;
  private cache: StoredAgentMemos | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(paseoHome: string, logger: Logger) {
    this.filePath = path.join(paseoHome, "agent-memos.json");
    this.logger = logger.child({ module: "agent", component: "agent-memos" });
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  list(agentId: string): AgentMemo[] {
    return this.snapshot().memosByAgentId[agentId] ?? [];
  }

  async add(agentId: string, text: string): Promise<AgentMemo> {
    return this.enqueue(async () => {
      await this.load();
      const memo: AgentMemo = {
        id: `memo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        text,
        createdAt: new Date().toISOString(),
      };
      const memos = this.snapshot().memosByAgentId[agentId] ?? [];
      if (memos.length >= AGENT_MEMOS_MAX_PER_AGENT) {
        throw new Error(`Agent has reached the maximum of ${AGENT_MEMOS_MAX_PER_AGENT} memos`);
      }
      await this.persist({
        ...this.snapshot(),
        memosByAgentId: {
          ...this.snapshot().memosByAgentId,
          [agentId]: [...memos, memo],
        },
      });
      return memo;
    });
  }

  async update(agentId: string, memoId: string, text: string): Promise<AgentMemo> {
    return this.enqueue(async () => {
      await this.load();
      const memos = this.snapshot().memosByAgentId[agentId] ?? [];
      const index = memos.findIndex((memo) => memo.id === memoId);
      if (index < 0) {
        throw new Error(`Memo not found: ${memoId}`);
      }
      const updated: AgentMemo = { ...memos[index]!, text };
      const next = [...memos];
      next[index] = updated;
      await this.persist({
        ...this.snapshot(),
        memosByAgentId: {
          ...this.snapshot().memosByAgentId,
          [agentId]: next,
        },
      });
      return updated;
    });
  }

  async delete(agentId: string, memoId: string): Promise<boolean> {
    return this.enqueue(async () => {
      await this.load();
      const memos = this.snapshot().memosByAgentId[agentId] ?? [];
      const next = memos.filter((memo) => memo.id !== memoId);
      if (next.length === memos.length) {
        return false;
      }
      await this.persist({
        ...this.snapshot(),
        memosByAgentId: {
          ...this.snapshot().memosByAgentId,
          [agentId]: next,
        },
      });
      return true;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private snapshot(): StoredAgentMemos {
    return this.cache ?? EMPTY_STORE;
  }

  private async load(): Promise<void> {
    if (this.cache) return;
    let raw: string | null = null;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch {
      this.cache = EMPTY_STORE;
      return;
    }
    try {
      this.cache = AGENT_MEMOS_SCHEMA.parse(JSON.parse(raw));
    } catch (error) {
      this.logger.error({ err: error, path: this.filePath }, "Failed to parse agent memos store");
      this.cache = EMPTY_STORE;
    }
  }

  private async persist(next: StoredAgentMemos): Promise<void> {
    await writeJsonFileAtomic(this.filePath, next);
    this.cache = next;
  }
}
