/**
 * Pure helpers for the app-side file logger (`app-log.ts`). Kept dependency-free so the
 * formatting and rotation rules are unit-testable outside the native filesystem layer.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogLineInput {
  timestamp: string;
  category: string;
  event: string;
  details?: unknown;
  level: LogLevel;
}

export function safeStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

/** `2026-09-07T06:00:00.000Z [category] event {"details":...}` — one line per entry. */
export function formatLogLine(input: LogLineInput): string {
  const detailsText = input.details === undefined ? "" : ` ${safeStringify(input.details)}`;
  return `${input.timestamp} [${input.category}] ${input.event}${detailsText}`;
}

export const MAX_LOG_BYTES = 10 * 1024 * 1024;

/** Whether the log file has outgrown the cap and should be trimmed. */
export function shouldRotate(size: number | null, maxBytes: number = MAX_LOG_BYTES): boolean {
  return size !== null && size > maxBytes;
}

/**
 * Keep roughly the newest half of an oversized log. `size` is byte-based on disk while this
 * trims by characters; good enough for a coarse rotation cap.
 */
export function rotateLogContent(content: string, maxBytes: number = MAX_LOG_BYTES): string {
  if (content.length <= maxBytes) {
    return content;
  }
  const keep = Math.floor(maxBytes * 0.5);
  const start = content.length - keep;
  const firstNewline = content.indexOf("\n", start);
  return firstNewline >= 0 ? content.slice(firstNewline + 1) : content.slice(start);
}
