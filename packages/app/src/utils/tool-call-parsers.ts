import { z } from "zod";
import type { HighlightToken } from "@getpaseo/highlight";

export interface DiffSegment {
  text: string;
  changed: boolean;
}

export interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  segments?: DiffSegment[];
  // Syntax-highlight tokens for the code on this line (prefix char excluded),
  // attached by highlightDiffLines when the file's language is supported.
  tokens?: HighlightToken[];
}

function splitIntoLines(text: string): string[] {
  if (!text) {
    return [];
  }

  return text.replace(/\r\n/g, "\n").split("\n");
}

function splitIntoWords(text: string): string[] {
  // Keep words and horizontal whitespace intact, but match punctuation and
  // newlines separately so a moved delimiter does not mark its neighbors.
  return text.match(/[\p{L}\p{N}_]+|[ \t\r]+|[^\p{L}\p{N}_ \t\r]/gu) ?? [];
}

const MAX_WORD_DIFF_CELLS = 1_000_000;

function computeWordLevelDiff(
  oldText: string,
  newText: string,
): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } | null {
  const oldWords = splitIntoWords(oldText);
  const newWords = splitIntoWords(newText);
  const oldInLCS = new Uint8Array(oldWords.length);
  const newInLCS = new Uint8Array(newWords.length);

  // Trim shared edges before allocating the LCS table. Large unchanged
  // prefixes and suffixes should not make a small edit expensive.
  let start = 0;
  let oldEnd = oldWords.length;
  let newEnd = newWords.length;
  while (start < oldEnd && start < newEnd && oldWords[start] === newWords[start]) {
    oldInLCS[start] = newInLCS[start] = 1;
    start += 1;
  }
  while (oldEnd > start && newEnd > start && oldWords[oldEnd - 1] === newWords[newEnd - 1]) {
    oldInLCS[--oldEnd] = newInLCS[--newEnd] = 1;
  }

  const m = oldEnd - start;
  const n = newEnd - start;
  if (m > 0 && n > 0) {
    const width = n + 1;
    const cells = (m + 1) * width;
    // Keep the existing whole-line backgrounds for very large replacements
    // rather than blocking the UI on an unbounded quadratic comparison.
    if (cells > MAX_WORD_DIFF_CELLS) return null;
    const dp = new Uint32Array(cells);
    for (let i = m - 1; i >= 0; i -= 1) {
      const row = i * width;
      const nextRow = row + width;
      for (let j = n - 1; j >= 0; j -= 1) {
        dp[row + j] =
          oldWords[start + i] === newWords[start + j]
            ? dp[nextRow + j + 1] + 1
            : Math.max(dp[nextRow + j], dp[row + j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (oldWords[start + i] === newWords[start + j]) {
        oldInLCS[start + i] = newInLCS[start + j] = 1;
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
  }

  const buildSegments = (words: string[], inLCS: Uint8Array): DiffSegment[] => {
    const segments: DiffSegment[] = [];
    for (let index = 0; index < words.length; index += 1) {
      const text = words[index];
      const changed = inLCS[index] === 0;
      const previous = segments.at(-1);
      if (previous?.changed === changed) {
        previous.text += text;
      } else {
        segments.push({ text, changed });
      }
    }
    return segments;
  };

  return {
    oldSegments: buildSegments(oldWords, oldInLCS),
    newSegments: buildSegments(newWords, newInLCS),
  };
}

function assignWordSegments(lines: DiffLine[], segments: DiffSegment[]): void {
  let lineIndex = 0;
  let lineSegments: DiffSegment[] = [];
  for (const segment of segments) {
    const parts = segment.text.split("\n");
    for (let index = 0; index < parts.length; index += 1) {
      if (index > 0) {
        lines[lineIndex++].segments = lineSegments;
        lineSegments = [];
      }
      const text = parts[index];
      if (!text) continue;
      const previous = lineSegments.at(-1);
      if (previous?.changed === segment.changed) {
        previous.text += text;
      } else {
        lineSegments.push({ text, changed: segment.changed });
      }
    }
  }
  lines[lineIndex].segments = lineSegments;
}

// Compare both sides of each change block, not just the two rows at its
// remove/add boundary. This preserves common code across line joins/splits.
function attachWordSegments(diff: DiffLine[]): void {
  let index = 0;
  while (index < diff.length) {
    if (diff[index].type !== "remove" && diff[index].type !== "add") {
      index += 1;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < diff.length && (diff[index].type === "remove" || diff[index].type === "add")) {
      const line = diff[index++];
      (line.type === "remove" ? removed : added).push(line);
    }
    if (removed.length === 0 || added.length === 0) continue;
    const comparison = computeWordLevelDiff(
      removed.map((line) => line.content.slice(1)).join("\n"),
      added.map((line) => line.content.slice(1)).join("\n"),
    );
    if (!comparison) continue;
    assignWordSegments(removed, comparison.oldSegments);
    assignWordSegments(added, comparison.newSegments);
  }
}

export function buildLineDiff(originalText: string, updatedText: string): DiffLine[] {
  const originalLines = splitIntoLines(originalText);
  const updatedLines = splitIntoLines(updatedText);

  const hasAnyContent = originalLines.length > 0 || updatedLines.length > 0;
  if (!hasAnyContent) {
    return [];
  }

  const m = originalLines.length;
  const n = updatedLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (originalLines[i] === updatedLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (originalLines[i] === updatedLines[j]) {
      diff.push({ type: "context", content: ` ${originalLines[i]}` });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ type: "remove", content: `-${originalLines[i]}` });
      i += 1;
    } else {
      diff.push({ type: "add", content: `+${updatedLines[j]}` });
      j += 1;
    }
  }

  while (i < m) {
    diff.push({ type: "remove", content: `-${originalLines[i]}` });
    i += 1;
  }

  while (j < n) {
    diff.push({ type: "add", content: `+${updatedLines[j]}` });
    j += 1;
  }

  attachWordSegments(diff);

  return diff;
}

export function parseUnifiedDiff(diffText?: string): DiffLine[] {
  if (!diffText) {
    return [];
  }

  const lines = splitIntoLines(diffText);
  const diff: DiffLine[] = [];

  for (const line of lines) {
    if (!line.length) {
      diff.push({ type: "context", content: line });
      continue;
    }

    if (line.startsWith("@@")) {
      diff.push({ type: "header", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      if (!line.startsWith("+++")) {
        diff.push({ type: "add", content: line });
      }
      continue;
    }

    if (line.startsWith("-")) {
      if (!line.startsWith("---")) {
        diff.push({ type: "remove", content: line });
      }
      continue;
    }

    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      continue;
    }

    if (line.startsWith("\\ No newline")) {
      diff.push({ type: "header", content: line });
      continue;
    }

    diff.push({ type: "context", content: line });
  }

  attachWordSegments(diff);

  return diff;
}

// ---- Task Extraction (cross-provider) ----

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskEntry {
  text: string;
  status: TaskStatus;
  completed: boolean;
}

const TaskStatusSchema = z.enum(["pending", "in_progress", "completed"]);

const ClaudeTodoWriteSchema = z.object({
  todos: z.array(
    z.object({
      content: z.string(),
      status: TaskStatusSchema,
      activeForm: z.string().optional(),
    }),
  ),
});

const UpdatePlanSchema = z.object({
  plan: z.array(
    z.object({
      step: z.string(),
      status: TaskStatusSchema.catch("pending"),
    }),
  ),
});

function normalizeToolName(toolName: string): string {
  return toolName
    .trim()
    .replace(/[.\s-]+/g, "_")
    .toLowerCase();
}

export function extractTaskEntriesFromToolCall(
  toolName: string,
  input: unknown,
): TaskEntry[] | null {
  const normalized = normalizeToolName(toolName);

  // Claude's plan mode uses ExitPlanMode for the approval prompt; it is not a task list.
  if (normalized === "exitplanmode") {
    return null;
  }

  if (normalized === "todowrite" || normalized === "todo_write") {
    const parsed = ClaudeTodoWriteSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    return parsed.data.todos.map((todo) => {
      const status = todo.status;
      const text = todo.activeForm?.trim() || todo.content.trim();
      return {
        text: text.length ? text : todo.content,
        status,
        completed: status === "completed",
      };
    });
  }

  if (normalized === "update_plan") {
    const parsed = UpdatePlanSchema.safeParse(input);
    if (!parsed.success) {
      return null;
    }
    return parsed.data.plan
      .map((entry) => ({
        text: entry.step.trim(),
        status: entry.status,
        completed: entry.status === "completed",
      }))
      .filter((entry) => entry.text.length > 0);
  }

  return null;
}
