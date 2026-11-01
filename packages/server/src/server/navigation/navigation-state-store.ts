import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Logger } from "pino";

import { writeJsonFileAtomic } from "../atomic-file.js";
import {
  NAVIGATION_DEVICE_MAX_COUNT,
  NAVIGATION_RECENT_VISITS_MAX,
  NAVIGATION_STACK_MAX_ENTRIES,
} from "@getpaseo/protocol/navigation-limits";
import {
  NavigationRecentVisitSchema,
  NavigationStackSchema,
  type NavigationState,
} from "@getpaseo/protocol/messages";

const NAVIGATION_STATE_FILE_SCHEMA = z.object({
  version: z.literal(1).default(1),
  recentVisits: z.array(NavigationRecentVisitSchema).max(NAVIGATION_RECENT_VISITS_MAX).default([]),
  stacksByDeviceKey: z.record(z.string(), NavigationStackSchema).default({}),
});

type StoredNavigationState = z.infer<typeof NAVIGATION_STATE_FILE_SCHEMA>;

const EMPTY_STATE: StoredNavigationState = {
  version: 1,
  recentVisits: [],
  stacksByDeviceKey: {},
};

/**
 * 侧栏的前进/后退栈与最近访问，按 daemon 存储，刷新或第二个客户端不会从零开始。
 *
 * 两种生命周期刻意放同一个文件：最近访问属于用户，所有设备共享；栈属于单台设备，
 * 否则两个窗口走不同路径时会互相覆盖游标。
 */
export class NavigationStateStore {
  private readonly filePath: string;
  private readonly logger: Logger;
  private cache: StoredNavigationState | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(paseoHome: string, logger: Logger) {
    this.filePath = path.join(paseoHome, "navigation-state.json");
    this.logger = logger.child({ module: "navigation-state" });
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  get(deviceKey: string): NavigationState {
    const state = this.snapshot();
    return {
      recentVisits: [...state.recentVisits],
      stack: state.stacksByDeviceKey[deviceKey] ?? null,
    };
  }

  async set(deviceKey: string, state: NavigationState): Promise<NavigationState> {
    return this.enqueue(async () => {
      await this.load();
      const current = this.snapshot();
      const stacks = { ...current.stacksByDeviceKey };
      if (state.stack) {
        const dropped = Math.max(0, state.stack.entries.length - NAVIGATION_STACK_MAX_ENTRIES);
        const entries = state.stack.entries.slice(dropped);
        stacks[deviceKey] = {
          entries,
          // 裁掉前面之后游标要跟着前移，否则它指向的位置已经不存在。
          cursor:
            entries.length === 0 ? 0 : clamp(state.stack.cursor - dropped, 0, entries.length - 1),
        };
      } else {
        delete stacks[deviceKey];
      }
      const next: StoredNavigationState = {
        version: 1,
        recentVisits: state.recentVisits.slice(0, NAVIGATION_RECENT_VISITS_MAX),
        stacksByDeviceKey: trimStacks(stacks, deviceKey),
      };
      await this.persist(next);
      return {
        recentVisits: [...next.recentVisits],
        stack: next.stacksByDeviceKey[deviceKey] ?? null,
      };
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private snapshot(): StoredNavigationState {
    return this.cache ?? EMPTY_STATE;
  }

  private async load(): Promise<void> {
    if (this.cache) return;
    let raw: string | null = null;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch {
      this.cache = EMPTY_STATE;
      return;
    }
    try {
      this.cache = NAVIGATION_STATE_FILE_SCHEMA.parse(JSON.parse(raw));
    } catch (error) {
      this.logger.error({ err: error, path: this.filePath }, "Failed to parse navigation state");
      this.cache = EMPTY_STATE;
    }
  }

  private async persist(next: StoredNavigationState): Promise<void> {
    await writeJsonFileAtomic(this.filePath, next);
    this.cache = next;
  }
}

/**
 * 防止文件里为每个连过的浏览器都留一份栈。正在写入的设备一定保留；更旧的 key 按
 * 插入顺序淘汰，这是本文件能记录的、最接近“最久未用”的依据。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function trimStacks(
  stacks: Record<string, z.infer<typeof NavigationStackSchema>>,
  writingDeviceKey: string,
): Record<string, z.infer<typeof NavigationStackSchema>> {
  const keys = Object.keys(stacks);
  if (keys.length <= NAVIGATION_DEVICE_MAX_COUNT) {
    return stacks;
  }
  const kept: Record<string, z.infer<typeof NavigationStackSchema>> = {};
  const keepCount = NAVIGATION_DEVICE_MAX_COUNT - 1;
  const others = keys.filter((key) => key !== writingDeviceKey).slice(-keepCount);
  for (const key of others) {
    kept[key] = stacks[key]!;
  }
  // 写入方可能刚清掉自己的栈（state.stack 为 null），此时它已不在表里，不能补一个 undefined。
  const writingStack = stacks[writingDeviceKey];
  if (writingStack) {
    kept[writingDeviceKey] = writingStack;
  }
  return kept;
}
