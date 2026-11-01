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
 * Pi 的 `fork`/`clone` 是运行时 RPC，这里做等价的事：把源会话当前分支上直到
 * `upToEntryId` 的条目复制进一个带新 session id 的会话文件，`resumeSession` 就能把它当独立
 * 会话打开。Pi 的会话身份只在头部行，条目里的 id 与 parentId 原样保留，源文件和源运行时都不动。
 */
export async function forkPiSessionFile(input: {
  sessionFile: string;
  /** 省略时整条活跃分支都复制：Pi 顺序追加，最后一条就是当前叶子。 */
  upToEntryId?: string;
}): Promise<{ sessionId: string; sessionFile: string }> {
  const content = await readFile(input.sessionFile, "utf8");
  const lines = content.split("\n");
  const headerLine = parseHeader(lines[0]);
  const entries = lines.slice(1).flatMap((line) => {
    if (!line.trim()) return [];
    const value = parseEntryLine(line);
    return value && typeof value.id === "string" ? [value] : [];
  });

  const target = input.upToEntryId
    ? resolveForkTarget(entries, input.upToEntryId)
    : entries.at(-1)?.id;
  const chain = target ? entryChainTo(entries, target) : [];
  if (chain.length === 0) {
    throw new Error(
      `Pi fork target ${input.upToEntryId ?? "active leaf"} was not found in the session file`,
    );
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
    // 坏行跳过：分叉复制能读出来的部分，条目都来自这次读取，写回新文件不会损坏源数据。
    return null;
  }
}

/**
 * 把分叉边界解析成条目 id。应用层的回合边界挂在 assistant 消息 id 上，Pi 里那是模型响应的
 * responseId（不是条目 id）；历史回放早于 responseId 记录的条目带的是生成 id。
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

/** 从目标条目沿 parentId 走到根，返回从根到目标的链。 */
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

/** Pi 的会话文件名是 `<时间戳>_<sessionId>.jsonl`，沿用源文件的时间戳前缀。 */
function timestampStem(sourceFile: string): string {
  const name = basename(sourceFile, extname(sourceFile));
  const separator = name.lastIndexOf("_");
  return separator > 0 ? name.slice(0, separator) : name;
}
