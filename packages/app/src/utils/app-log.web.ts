import { formatLogLine, type LogLevel } from "./app-log-core";

/**
 * Web logger: no filesystem on the browser tab, so it only mirrors to the console.
 * Metro picks this file for `web` builds; the native one writes the log file.
 * `appLogSync` has no useful web meaning beyond the console mirror, but it must stay
 * exported so crash reporting code resolves on both platforms.
 */

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
