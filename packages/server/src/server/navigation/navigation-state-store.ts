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
 * The sidebar's back/forward stack and recent visits, stored per daemon so a reload or a second
 * client does not start from nothing.
 *
 * Two lifetimes live in one file on purpose: recent visits are the user's, shared by every
 * device; a stack belongs to one device, because two windows walking different paths would
 * otherwise overwrite each other's cursor.
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
        stacks[deviceKey] = {
          entries: state.stack.entries.slice(-NAVIGATION_STACK_MAX_ENTRIES),
          cursor: state.stack.cursor,
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
 * Keeps the file from accumulating one stack per browser that ever connected. The writing device
 * is always kept; older keys go in insertion order, which is the closest thing to "least recent"
 * this file records.
 */
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
  kept[writingDeviceKey] = stacks[writingDeviceKey]!;
  return kept;
}
