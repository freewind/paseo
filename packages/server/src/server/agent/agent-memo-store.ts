import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Logger } from "pino";

import { writeJsonFileAtomic } from "../atomic-file.js";
import { AgentMemoSchema, type AgentMemo } from "@getpaseo/protocol/messages";

type MemoImage = NonNullable<AgentMemo["images"]>[number];

const AGENT_MEMOS_SCHEMA = z.object({
  version: z.literal(1).default(1),
  memos: z.array(AgentMemoSchema).default([]),
});

type StoredAgentMemos = z.infer<typeof AGENT_MEMOS_SCHEMA>;

const EMPTY_FILE: StoredAgentMemos = { version: 1, memos: [] };

/**
 * daemon 侧的按 agent 备忘存储，每个 agent 一个文件
 * （`$PASEO_HOME/agent-memos/<agentId>.json`）。
 *
 * 分文件是为了让一次改动只重写自己那一份：备忘图片内联成 base64 存在同一个文件里，
 * 写成单文件的话，勾一下完成也要把全库重新序列化一遍，文件越大越慢，而且不同 agent
 * 的写操作被迫排在同一个队列里。
 *
 * 备忘是用户钉在某个 agent 上的短文本，可以一键填回输入框。它跟着 agent 跑、跨客户端
 * 留存，所以存在 daemon 这一侧，所有客户端看到同一份列表。每次改动都回全量列表，
 * 客户端按替换对齐，而不是合并可能已经分叉的顺序。
 */
export class AgentMemoStore {
  private readonly dirPath: string;
  private readonly logger: Logger;
  private readonly cache = new Map<string, StoredAgentMemos>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(paseoHome: string, logger: Logger) {
    this.dirPath = path.join(paseoHome, "agent-memos");
    this.logger = logger.child({ module: "agent", component: "agent-memos" });
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true });
  }

  async list(agentId: string): Promise<AgentMemo[]> {
    return (await this.load(agentId)).memos;
  }

  async add(agentId: string, text: string, images?: readonly MemoImage[]): Promise<AgentMemo> {
    return this.enqueue(agentId, async () => {
      const now = new Date().toISOString();
      const memo: AgentMemo = {
        id: `memo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        text,
        createdAt: now,
        updatedAt: now,
        ...(images && images.length > 0 ? { images: [...images] } : {}),
      };
      const memos = (await this.load(agentId)).memos;
      await this.persist(agentId, { version: 1, memos: [...memos, memo] });
      return memo;
    });
  }

  async update(
    agentId: string,
    memoId: string,
    text: string,
    images?: readonly MemoImage[],
  ): Promise<AgentMemo> {
    return this.enqueue(agentId, async () => {
      const memos = (await this.load(agentId)).memos;
      const index = memos.findIndex((memo) => memo.id === memoId);
      if (index < 0) {
        throw new Error(`Memo not found: ${memoId}`);
      }
      const updated: AgentMemo = {
        ...memos[index]!,
        text,
        updatedAt: new Date().toISOString(),
        ...(images === undefined ? {} : { images: images.length > 0 ? [...images] : undefined }),
      };
      const next = [...memos];
      next[index] = updated;
      await this.persist(agentId, { version: 1, memos: next });
      return updated;
    });
  }

  /** 只翻完成标记，不动正文；存储里没有这个字段就是未完成。 */
  async setCompleted(agentId: string, memoId: string, completed: boolean): Promise<AgentMemo> {
    return this.enqueue(agentId, async () => {
      const memos = (await this.load(agentId)).memos;
      const index = memos.findIndex((memo) => memo.id === memoId);
      if (index < 0) {
        throw new Error(`Memo not found: ${memoId}`);
      }
      const updated: AgentMemo = {
        ...memos[index]!,
        completed,
        updatedAt: new Date().toISOString(),
      };
      const next = [...memos];
      next[index] = updated;
      await this.persist(agentId, { version: 1, memos: next });
      return updated;
    });
  }

  async delete(agentId: string, memoId: string): Promise<boolean> {
    return this.enqueue(agentId, async () => {
      const memos = (await this.load(agentId)).memos;
      const next = memos.filter((memo) => memo.id !== memoId);
      if (next.length === memos.length) {
        return false;
      }
      await this.persist(agentId, { version: 1, memos: next });
      return true;
    });
  }

  /** 会话被彻底删除时连文件一起删，免得留下没人认领的备忘。 */
  async remove(agentId: string): Promise<void> {
    this.cache.delete(agentId);
    await this.enqueue(agentId, async () => {
      await fs.rm(this.filePath(agentId), { force: true });
    });
  }

  /** 同一个 agent 的写入按顺序排队，不同 agent 互不阻塞。 */
  private enqueue<T>(agentId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(agentId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    this.queues.set(agentId, run.catch(() => undefined));
    return run;
  }

  private filePath(agentId: string): string {
    return path.join(this.dirPath, `${encodeURIComponent(agentId)}.json`);
  }

  private async load(agentId: string): Promise<StoredAgentMemos> {
    const cached = this.cache.get(agentId);
    if (cached) return cached;
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath(agentId), "utf8");
    } catch {
      this.cache.set(agentId, EMPTY_FILE);
      return EMPTY_FILE;
    }
    let parsed: StoredAgentMemos;
    try {
      parsed = AGENT_MEMOS_SCHEMA.parse(JSON.parse(raw));
    } catch (error) {
      this.logger.error({ err: error, agentId }, "Failed to parse agent memos file");
      parsed = EMPTY_FILE;
    }
    this.cache.set(agentId, parsed);
    return parsed;
  }

  private async persist(agentId: string, next: StoredAgentMemos): Promise<void> {
    await writeJsonFileAtomic(this.filePath(agentId), next);
    this.cache.set(agentId, next);
  }
}
