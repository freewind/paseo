/** 刻意不引依赖，格式与轮转规则才能脱离原生文件系统测。 */

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

/** `2026-09-07T06:00:00.000Z [category] event {"details":...}`，每条一行。 */
export function formatLogLine(input: LogLineInput): string {
  const detailsText = input.details === undefined ? "" : ` ${safeStringify(input.details)}`;
  return `${input.timestamp} [${input.category}] ${input.event}${detailsText}`;
}

export const MAX_LOG_BYTES = 10 * 1024 * 1024;

export function shouldRotate(size: number | null, maxBytes: number = MAX_LOG_BYTES): boolean {
  return size !== null && size > maxBytes;
}

/** 只保留最新约一半；磁盘按字节、这里按字符，粗粒度够用。 */
export function rotateLogContent(content: string, maxBytes: number = MAX_LOG_BYTES): string {
  if (content.length <= maxBytes) {
    return content;
  }
  const keep = Math.floor(maxBytes * 0.5);
  const start = content.length - keep;
  const firstNewline = content.indexOf("\n", start);
  return firstNewline >= 0 ? content.slice(firstNewline + 1) : content.slice(start);
}
