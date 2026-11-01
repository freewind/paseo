import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Logger } from "pino";

import { writeJsonFileAtomic } from "../atomic-file.js";
import {
  AGENT_MEMO_IMAGE_MAX_BYTES,
  AGENT_MEMO_IMAGES_TOTAL_MAX_BYTES,
  AGENT_MEMO_MAX_IMAGES,
  AGENT_MEMOS_MAX_PER_AGENT,
} from "@getpaseo/protocol/agent-memo-limits";
import { AgentMemoSchema, type AgentMemo } from "@getpaseo/protocol/messages";

type MemoImage = NonNullable<AgentMemo["images"]>[number];

/** base64 每 4 个字符还原 3 字节，尾部的 padding 不占字节。 */
function decodedBase64Bytes(data: string): number {
  let padding = 0;
  if (data.endsWith("==")) {
    padding = 2;
  } else if (data.endsWith("=")) {
    padding = 1;
  }
  return Math.floor((data.length * 3) / 4) - padding;
}

/**
 * 拒收存不下的图片。内联 base64 正是这个检查放在这里的原因：超限的备忘会被原样写进
 * JSON 文件。
 */
function assertMemoImages(images: readonly MemoImage[] | undefined): void {
  if (!images || images.length === 0) return;
  if (images.length > AGENT_MEMO_MAX_IMAGES) {
    throw new Error(`A memo holds at most ${AGENT_MEMO_MAX_IMAGES} images`);
  }
  for (const image of images) {
    if (!image.mimeType.startsWith("image/")) {
      throw new Error(`Memo image must be an image, got ${image.mimeType}`);
    }
    if (decodedBase64Bytes(image.data) > AGENT_MEMO_IMAGE_MAX_BYTES) {
      throw new Error(`Memo image exceeds ${AGENT_MEMO_IMAGE_MAX_BYTES} bytes`);
    }
  }
}

/** JSON 文件里存的是 base64 字符数，所以这里算的是单条备忘的落盘大小。 */
function memoImagesBytes(images: readonly MemoImage[] | undefined): number {
  if (!images || images.length === 0) return 0;
  let total = 0;
  for (const image of images) {
    total += image.data.length;
  }
  return total;
}

/**
 * 拒收会让单个 agent 的备忘图片超预算的写入。daemon 每次改动都会重新序列化整个文件，
 * 所以要看的是这个 agent 的总量，不是单条备忘的大小。`replacedMemoId` 把正在被替换的
 * 那条排除掉，避免它的旧图被算两遍。
 */
function assertMemoImagesBudget(input: {
  agentId: string;
  memos: readonly AgentMemo[];
  nextImages: readonly MemoImage[] | undefined;
  replacedMemoId?: string;
}): void {
  let total = memoImagesBytes(input.nextImages);
  for (const memo of input.memos) {
    if (memo.id === input.replacedMemoId) continue;
    total += memoImagesBytes(memo.images);
  }
  if (total > AGENT_MEMO_IMAGES_TOTAL_MAX_BYTES) {
    throw new Error(
      `Agent memo images for ${input.agentId} total ${total} base64 bytes, over the ${AGENT_MEMO_IMAGES_TOTAL_MAX_BYTES}-byte budget`,
    );
  }
}

const AGENT_MEMOS_SCHEMA = z.object({
  version: z.literal(1).default(1),
  memosByAgentId: z.record(z.string(), z.array(AgentMemoSchema)).default({}),
});

type StoredAgentMemos = z.infer<typeof AGENT_MEMOS_SCHEMA>;

const EMPTY_STORE: StoredAgentMemos = { version: 1, memosByAgentId: {} };

/**
 * daemon 侧的按 agent 备忘存储。
 *
 * 备忘是用户钉在某个 agent 上的短文本，可以一键填回输入框。它们存在 daemon
 * （`$PASEO_HOME/agent-memos.json`），所有客户端看到同一份列表；写入按条串行，多个
 * 客户端在文件这一层排队，每次改动都回全量列表，所以客户端按替换对齐，而不是合并
 * 可能已经分叉的顺序。
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

  async add(agentId: string, text: string, images?: readonly MemoImage[]): Promise<AgentMemo> {
    assertMemoImages(images);
    return this.enqueue(async () => {
      await this.load();
      const now = new Date().toISOString();
      const memo: AgentMemo = {
        id: `memo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        text,
        createdAt: now,
        updatedAt: now,
        ...(images && images.length > 0 ? { images: [...images] } : {}),
      };
      const memos = this.snapshot().memosByAgentId[agentId] ?? [];
      if (memos.length >= AGENT_MEMOS_MAX_PER_AGENT) {
        throw new Error(`Agent has reached the maximum of ${AGENT_MEMOS_MAX_PER_AGENT} memos`);
      }
      assertMemoImagesBudget({ agentId, memos, nextImages: images });
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

  async update(
    agentId: string,
    memoId: string,
    text: string,
    images?: readonly MemoImage[],
  ): Promise<AgentMemo> {
    assertMemoImages(images);
    return this.enqueue(async () => {
      await this.load();
      const memos = this.snapshot().memosByAgentId[agentId] ?? [];
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
      assertMemoImagesBudget({
        agentId,
        memos,
        nextImages: updated.images,
        replacedMemoId: memoId,
      });
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

  /** 只翻完成标记，不动正文；存储里没有这个字段就是未完成。 */
  async setCompleted(agentId: string, memoId: string, completed: boolean): Promise<AgentMemo> {
    return this.enqueue(async () => {
      await this.load();
      const memos = this.snapshot().memosByAgentId[agentId] ?? [];
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
