import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { forkOmpSessionFile } from "./fork.js";
import { readActiveOmpEntryChain } from "./history.js";

async function writeSession(entries: object[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "paseo-omp-fork-"));
  const sessionFile = join(directory, "2026-08-26T11-15-43-163Z_source.jsonl");
  await writeFile(
    sessionFile,
    `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );
  return sessionFile;
}

const ENTRIES = [
  { type: "session", id: "root", parentId: null, cwd: "/repo" },
  { type: "message", id: "user-1", parentId: "root", message: { role: "user", content: "one" } },
  {
    type: "message",
    id: "assistant-1",
    parentId: "user-1",
    message: { role: "assistant", content: "a" },
  },
  {
    type: "message",
    id: "user-2",
    parentId: "assistant-1",
    message: { role: "user", content: "two" },
  },
  {
    type: "message",
    id: "assistant-2",
    parentId: "user-2",
    message: { role: "assistant", content: "b" },
  },
];

describe("forkOmpSessionFile", () => {
  test("writes an independent session holding only the chain up to the boundary", async () => {
    const sessionFile = await writeSession(ENTRIES);

    const fork = await forkOmpSessionFile({ sessionFile, upToEntryId: "user-2" });

    const chain = await readActiveOmpEntryChain(fork.sessionFile);
    expect(chain[0]?.id).toBe(fork.sessionId);
    expect(chain[0]?.cwd).toBe("/repo");
    expect(chain.filter((entry) => entry.message).map((entry) => entry.message?.content)).toEqual([
      "one",
      "a",
      "two",
    ]);
    expect(fork.sessionId).not.toBe("root");
  });

  test("leaves the source session file and its full chain untouched", async () => {
    const sessionFile = await writeSession(ENTRIES);
    const before = await readFile(sessionFile, "utf8");

    await forkOmpSessionFile({ sessionFile, upToEntryId: "user-1" });

    expect(await readFile(sessionFile, "utf8")).toBe(before);
    const sourceChain = await readActiveOmpEntryChain(sessionFile);
    expect(sourceChain).toHaveLength(5);
  });

  test("keeps the timestamp stem so the fork sorts next to its origin", async () => {
    const sessionFile = await writeSession(ENTRIES);

    const fork = await forkOmpSessionFile({ sessionFile, upToEntryId: "user-1" });

    expect(join(sessionFile, "..", fork.sessionFile.split("/").pop()!)).toBe(
      join(sessionFile, "..", `2026-08-26T11-15-43-163Z_${fork.sessionId}.jsonl`),
    );
  });

  test("rejects a boundary that is not in the session", async () => {
    const sessionFile = await writeSession(ENTRIES);

    await expect(forkOmpSessionFile({ sessionFile, upToEntryId: "user-404" })).rejects.toThrow(
      /was not found/,
    );
  });
});
