import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

interface OmpForkEntry {
  id?: string;
  parentId?: string | null;
  timestamp?: unknown;
  [key: string]: unknown;
}

/**
 * Offline equivalent of the runtime `branch` RPC: copies the source session file
 * up to `upToEntryId` into a new file whose root session entry gets a fresh id,
 * so `resumeSession` can open it as an independent session. The source file and
 * its live runtime are never touched.
 */
export async function forkOmpSessionFile(input: {
  sessionFile: string;
  upToEntryId: string;
}): Promise<{ sessionId: string; sessionFile: string }> {
  const content = await readFile(input.sessionFile, "utf8");
  const entries = content.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const value = JSON.parse(line) as OmpForkEntry;
      return value && typeof value === "object" && typeof value.id === "string" ? [value] : [];
    } catch {
      return [];
    }
  });

  const chain = entryChainTo(entries, input.upToEntryId);
  if (chain.length === 0) {
    throw new Error(`OMP fork target ${input.upToEntryId} was not found in the session file`);
  }
  const root = chain[0]!;

  // The root entry carries the session identity, and its children reference it by
  // id, so the root id changes and direct children re-point at the new one. The
  // entries were parsed from this read, so they are safe to rewrite in place.
  const sessionId = randomUUID();
  const previousRootId = root.id;
  root.id = sessionId;
  for (const entry of chain) {
    if (entry !== root && entry.parentId === previousRootId) {
      entry.parentId = sessionId;
    }
  }

  const sessionFile = join(
    dirname(input.sessionFile),
    `${timestampStem(input.sessionFile, root)}_${sessionId}${extname(input.sessionFile) || ".jsonl"}`,
  );
  await mkdir(dirname(sessionFile), { recursive: true });
  await writeFile(
    sessionFile,
    `${chain.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );
  return { sessionId, sessionFile };
}

/**
 * Walks parent links from the target entry back to the root and returns the chain
 * root-first, mirroring `readActiveOmpEntryChain`'s traversal.
 */
function entryChainTo(entries: readonly OmpForkEntry[], entryId: string): OmpForkEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id!, entry]));
  const chain: OmpForkEntry[] = [];
  const seen = new Set<string>();
  let current: OmpForkEntry | undefined = byId.get(entryId);
  while (current?.id && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain.toReversed();
}

/**
 * OMP names session files `<timestamp>_<sessionId>.jsonl`. Reuse the source stem
 * so the fork sorts next to its origin; fall back to the root entry timestamp.
 */
function timestampStem(sourceFile: string, root: OmpForkEntry): string {
  const name = basename(sourceFile, extname(sourceFile));
  const separator = name.lastIndexOf("_");
  if (separator > 0) {
    return name.slice(0, separator);
  }
  return typeof root.timestamp === "string" && root.timestamp
    ? root.timestamp.replace(/[:.]/g, "-")
    : Date.now().toString();
}
