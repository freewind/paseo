import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "pino";

import { AgentMemoStore } from "./agent-memo-store.js";

const logger: Logger = {
  child: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), "agent-memos-"));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

describe("AgentMemoStore", () => {
  it("adds a memo and persists it across reloads", async () => {
    const store = new AgentMemoStore(home, logger);
    await store.initialize();
    const memo = await store.add("agent-1", "重试登录链路");
    expect(memo.text).toBe("重试登录链路");
    expect(store.list("agent-1")).toHaveLength(1);

    const reloaded = new AgentMemoStore(home, logger);
    await reloaded.initialize();
    expect(reloaded.list("agent-1").map((entry) => entry.id)).toEqual([memo.id]);
  });

  it("updates an existing memo in place and keeps creation order", async () => {
    const store = new AgentMemoStore(home, logger);
    await store.initialize();
    const first = await store.add("agent-1", "one");
    const second = await store.add("agent-1", "two");
    const updated = await store.update("agent-1", first.id, "one-edited");

    expect(updated.text).toBe("one-edited");
    expect(store.list("agent-1").map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(store.list("agent-1")[0]?.text).toBe("one-edited");
  });

  it("rejects updating a missing memo without touching the list", async () => {
    const store = new AgentMemoStore(home, logger);
    await store.initialize();
    await store.add("agent-1", "keep");
    await expect(store.update("agent-1", "missing", "x")).rejects.toThrow("Memo not found");
    expect(store.list("agent-1")).toHaveLength(1);
  });

  it("deletes a memo and reports deleting an absent id as a no-op", async () => {
    const store = new AgentMemoStore(home, logger);
    await store.initialize();
    const memo = await store.add("agent-1", "gone soon");
    expect(await store.delete("agent-1", memo.id)).toBe(true);
    expect(store.list("agent-1")).toEqual([]);
    expect(await store.delete("agent-1", memo.id)).toBe(false);
  });

  it("keeps each agent's memos separate and serializes concurrent mutations", async () => {
    const store = new AgentMemoStore(home, logger);
    await store.initialize();
    await Promise.all([
      store.add("agent-1", "a1"),
      store.add("agent-1", "a2"),
      store.add("agent-2", "b1"),
    ]);

    expect(store.list("agent-1").map((entry) => entry.text)).toEqual(["a1", "a2"]);
    expect(store.list("agent-2").map((entry) => entry.text)).toEqual(["b1"]);

    const onDisk = JSON.parse(await fs.readFile(path.join(home, "agent-memos.json"), "utf8"));
    expect(onDisk.memosByAgentId["agent-1"]).toHaveLength(2);
    expect(onDisk.memosByAgentId["agent-2"]).toHaveLength(1);
  });

  it("treats a corrupted store as empty rather than throwing", async () => {
    await fs.writeFile(path.join(home, "agent-memos.json"), "not json", "utf8");
    const store = new AgentMemoStore(home, logger);
    await store.initialize();
    expect(store.list("agent-1")).toEqual([]);
    // And the next write repairs the file.
    await store.add("agent-1", "recovered");
    expect(store.list("agent-1")).toHaveLength(1);
  });
});
