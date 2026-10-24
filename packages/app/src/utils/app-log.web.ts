import { formatLogLine, type LogLevel } from "./app-log-core";

/** 浏览器没有文件系统，只镜像控制台；`appLogSync` 必须留着导出，崩溃上报才能在两个平台都解析。 */

function buildLine(category: string, event: string, details: unknown, level: LogLevel): string {
  return formatLogLine({
    timestamp: new Date().toISOString(),
    category,
    event,
    details,
    level,
  });
}

function mirrorToConsole(line: string, level: LogLevel): void {
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function appLog(
  category: string,
  event: string,
  details?: unknown,
  level: LogLevel = "info",
): void {
  mirrorToConsole(buildLine(category, event, details, level), level);
}

export function appLogSync(
  category: string,
  event: string,
  details?: unknown,
  level: LogLevel = "info",
): void {
  mirrorToConsole(buildLine(category, event, details, level), level);
}
