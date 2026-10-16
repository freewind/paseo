import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

interface PiForkEntry {
  type?: string;
  id?: string;
  parentId?: string | null;
  message?: { role?: unknown; responseId?: unknown } & Record<string, unknown>;
  [key: string]: unknown;
}

interface PiSessionHeaderLine {
  type?: unknown;
  [key: string]: unknown;
}

/**
 * Offline equivalent of Pi's `fork`/`clone` RPCs: copies the entries on the source session's
 * active branch up to `upToEntryId` (an entry id, or an assistant message's `responseId`) into
 * a new session file with a fresh session id, so `resumeSession` can open it as an independent
 * session. Pi keeps session identity in the header rather than in entries, so entry ids and
 * parent links are copied verbatim. The source file and its live runtime are never touched.
 */
export async function forkPiSessionFile(input: {
  sessionFile: string;
  upToEntryId: string;
}): Promise<{ sessionId: string; sessionFile: string }> {
  const content = await readFile(input.sessionFile, "utf8");
  const lines = content.split("\n");
  const headerLine = parseHeader(lines[0]);
  const entries = lines.slice(1).flatMap((line) => {
    if (!line.trim()) return [];
    const value = parseEntryLine(line);
    return value && typeof value.id === "string" ? [value] : [];
  });

  const target = resolveForkTarget(entries, input.upToEntryId);
  const chain = entryChainTo(entries, target);
  if (chain.length === 0) {
    throw new Error(`Pi fork target ${input.upToEntryId} was not found in the session file`);
  }

  const sessionId = randomUUID();
  const header = {
    ...headerLine,
    type: "session",
    id: sessionId,
    timestamp: new Date().toISOString(),
    parentSession: input.sessionFile,
  };
  const sessionFile = join(
    dirname(input.sessionFile),
    `${timestampStem(input.sessionFile)}_${sessionId}${extname(input.sessionFile) || ".jsonl"}`,
  );
  await writeFile(
    sessionFile,
    [JSON.stringify(header), ...chain.map((entry) => JSON.stringify(entry))].join("\n") + "\n",
    "utf8",
  );
  return { sessionId, sessionFile };
}

function parseHeader(line: string | undefined): PiSessionHeaderLine {
  if (!line?.trim()) {
    throw new Error("Pi fork requires a session file with a session header");
  }
  try {
    const value = JSON.parse(line) as PiSessionHeaderLine;
    if (value?.type !== "session") {
      throw new Error("Pi fork requires a session file with a session header");
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Pi fork requires")) {
      throw error;
    }
    throw new Error("Pi fork could not parse the session file header", { cause: error });
  }
}

function parseEntryLine(line: string): PiForkEntry | null {
  try {
    const value = JSON.parse(line) as PiForkEntry;
    return value && typeof value === "object" ? value : null;
  } catch {
    // Skip unparsable lines: fork copies what can be read, and the entries were
    // parsed from this read so rewriting them in place is safe.
    return null;
  }
}

/**
 * Resolves the fork boundary to an entry id. The app pins turn boundaries on assistant
 * message ids, which for Pi are the model response id (not a session entry id); entries
 * whose replay predates a stored responseId carry generated ids instead.
 */
function resolveForkTarget(entries: readonly PiForkEntry[], upToMessageId: string): string {
  if (entries.some((entry) => entry.id === upToMessageId)) {
    return upToMessageId;
  }
  const byResponseId = entries.find(
    (entry) =>
      entry.message?.role === "assistant" &&
      typeof entry.message.responseId === "string" &&
      entry.message.responseId === upToMessageId,
  );
  if (byResponseId?.id) {
    return byResponseId.id;
  }
  const generatedIndex = /^.*-history-assistant-(\d+)$/.exec(upToMessageId)?.[1];
  if (generatedIndex) {
    const nth = Number(generatedIndex);
    let assistantIndex = 0;
    for (const entry of entries) {
      if (entry.message?.role !== "assistant") continue;
      assistantIndex += 1;
      if (assistantIndex === nth && entry.id) {
        return entry.id;
      }
    }
  }
  throw new Error(`Pi fork target ${upToMessageId} was not found in the session file`);
}

/** Walks parent links from the target back to the root and returns the chain root-first. */
function entryChainTo(entries: readonly PiForkEntry[], entryId: string): PiForkEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id!, entry]));
  const chain: PiForkEntry[] = [];
  const seen = new Set<string>();
  let current: PiForkEntry | undefined = byId.get(entryId);
  while (current?.id && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain.toReversed();
}

/** Pi names session files `<timestamp>_<sessionId>.jsonl`; reuse the source stem. */
function timestampStem(sourceFile: string): string {
  const name = basename(sourceFile, extname(sourceFile));
  const separator = name.lastIndexOf("_");
  return separator > 0 ? name.slice(0, separator) : name;
}
