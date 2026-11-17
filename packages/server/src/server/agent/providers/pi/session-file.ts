import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { projectAgentMessages } from "../../agent-messages/envelope.js";
import { pushRecentUserMessage } from "../../history-stats.js";
import { getUserMessageText } from "./history-mapper.js";

export interface PiSessionEntry {
  [key: string]: unknown;
  type?: string;
  id: string;
  parentId?: string | null;
  message?: { [key: string]: unknown; role?: unknown; responseId?: unknown; content?: unknown };
}

export interface PiSessionFile {
  header: Record<string, unknown>;
  entries: PiSessionEntry[];
  leafId: string | undefined;
}

export async function readPiSessionFile(
  sessionFile: string,
  options: { failOnInvalidEntry?: boolean } = {},
): Promise<PiSessionFile> {
  const input = createReadStream(sessionFile, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const entriesById = new Map<string, PiSessionEntry>();
  let header: Record<string, unknown> | null = null;
  let leafId: string | undefined;

  try {
    for await (const line of lines) {
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch (error) {
        if (header === null) {
          throw new Error("Pi session file has an invalid header", { cause: error });
        }
        if (options.failOnInvalidEntry) {
          throw new Error("Pi session file has an invalid entry", { cause: error });
        }
        continue;
      }
      if (!isRecord(value)) {
        if (header === null) throw new Error("Pi session file has no session header");
        if (options.failOnInvalidEntry)
          throw new Error("Pi session file contains an invalid entry");
        continue;
      }
      if (header === null) {
        if (value.type !== "session") throw new Error("Pi session file has no session header");
        header = value;
        continue;
      }
      const entry = parsePiSessionEntry(value);
      if (!entry) {
        if (options.failOnInvalidEntry)
          throw new Error("Pi session file contains an invalid entry");
        continue;
      }
      entriesById.set(entry.id, entry);
      leafId = entry.id;
    }
  } finally {
    lines.close();
    input.destroy();
  }

  if (header === null) throw new Error("Pi session file has no session header");
  return { header, entries: [...entriesById.values()], leafId };
}

export async function readPiSessionHistoryStats(sessionFile: string): Promise<{
  userMessageCount: number;
  recentUserMessages: string[];
}> {
  const { entries, leafId } = await readPiSessionFile(sessionFile, { failOnInvalidEntry: true });
  const branch = piSessionEntryBranch(entries, leafId);
  let userMessageCount = 0;
  const recentUserMessages: string[] = [];

  for (const entry of branch) {
    if (entry.type !== "message" || entry.message?.role !== "user") continue;
    const text = getUserMessageText(entry.message.content);
    if (!text) continue;
    const items = projectAgentMessages({ type: "user_message", text });
    for (const item of items) {
      if (item.type !== "user_message") continue;
      userMessageCount += 1;
      pushRecentUserMessage(recentUserMessages, item.text);
    }
  }

  return { userMessageCount, recentUserMessages };
}

export function piSessionEntryChainTo(
  entries: readonly PiSessionEntry[],
  entryId: string,
): PiSessionEntry[] {
  return piSessionEntryBranch(entries, entryId);
}

function parsePiSessionEntry(value: Record<string, unknown>): PiSessionEntry | null {
  if (typeof value.id !== "string") return null;
  if (
    value.parentId !== undefined &&
    value.parentId !== null &&
    typeof value.parentId !== "string"
  ) {
    return null;
  }
  if (value.message !== undefined && !isRecord(value.message)) return null;
  return value as PiSessionEntry;
}

/** 沿 parentId 返回从根到当前叶子的活动分支。 */
function piSessionEntryBranch(
  entries: readonly PiSessionEntry[],
  leafId: string | undefined,
): PiSessionEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id!, entry]));
  const branch: PiSessionEntry[] = [];
  const visited = new Set<string>();
  let current = leafId ? byId.get(leafId) : undefined;

  while (current?.id && !visited.has(current.id)) {
    branch.push(current);
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return branch.toReversed();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
