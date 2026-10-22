import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "pino";

import { NavigationStateStore } from "./navigation-state-store.js";

const logger: Logger = {
  child: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "navigation-state-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

const entry = (pathname: string) => ({
  pathname,
  serverId: "server-1",
  workspaceId: "workspace-a",
  targetKey: null,
  tabId: null,
});

describe("NavigationStateStore", () => {
  it("starts empty for a device that never wrote", async () => {
    const store = new NavigationStateStore(home, logger);
    await store.initialize();

    expect(store.get("dev_a")).toEqual({ recentVisits: [], stack: null });
  });

  it("keeps one stack per device and the visits shared", async () => {
    const store = new NavigationStateStore(home, logger);
    await store.initialize();

    await store.set("dev_a", {
      recentVisits: [{ serverId: "server-1", workspaceId: "workspace-a", agentId: "agent-1" }],
      stack: { entries: [entry("/a")], cursor: 0 },
    });
    await store.set("dev_b", {
      recentVisits: [{ serverId: "server-1", workspaceId: "workspace-a", agentId: "agent-1" }],
      stack: { entries: [entry("/b")], cursor: 0 },
    });

    expect(store.get("dev_a").stack?.entries.map((item) => item.pathname)).toEqual(["/a"]);
    expect(store.get("dev_b").stack?.entries.map((item) => item.pathname)).toEqual(["/b"]);
    expect(store.get("dev_a").recentVisits).toHaveLength(1);
  });

  it("persists across a reload", async () => {
    const store = new NavigationStateStore(home, logger);
    await store.initialize();
    await store.set("dev_a", {
      recentVisits: [],
      stack: { entries: [entry("/a"), entry("/b")], cursor: 1 },
    });

    const reloaded = new NavigationStateStore(home, logger);
    await reloaded.initialize();

    expect(reloaded.get("dev_a").stack).toEqual({
      entries: [entry("/a"), entry("/b")],
      cursor: 1,
    });
  });

  it("drops the stack for a device that sends null", async () => {
    const store = new NavigationStateStore(home, logger);
    await store.initialize();
    await store.set("dev_a", { recentVisits: [], stack: { entries: [entry("/a")], cursor: 0 } });

    await store.set("dev_a", { recentVisits: [], stack: null });

    expect(store.get("dev_a").stack).toBeNull();
  });

  it("treats a corrupted file as empty instead of failing", async () => {
    await fs.writeFile(path.join(home, "navigation-state.json"), "{not json", "utf8");
    const store = new NavigationStateStore(home, logger);
    await store.initialize();

    expect(store.get("dev_a")).toEqual({ recentVisits: [], stack: null });
  });

  it("caps the number of device stacks it keeps", async () => {
    const store = new NavigationStateStore(home, logger);
    await store.initialize();
    for (let index = 0; index < 12; index += 1) {
      await store.set(`dev_${index}`, {
        recentVisits: [],
        stack: { entries: [entry(`/p${index}`)], cursor: 0 },
      });
    }

    const newest = store.get("dev_11");
    expect(newest.stack?.entries[0]?.pathname).toBe("/p11");
    // The oldest keys fall out; the file never grows without bound.
    expect(store.get("dev_0").stack).toBeNull();
  });
});
