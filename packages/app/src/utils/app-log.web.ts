import { formatLogLine, type LogLevel } from "./app-log-core";

/**
 * Web logger: no filesystem on the browser tab, so it only mirrors to the console.
 * Metro picks this file for `web` builds; the native one writes the log file.
 */

export function appLog(
  category: string,
  event: string,
  details?: unknown,
  level: LogLevel = "info",
): void {
  const line = formatLogLine({
    timestamp: new Date().toISOString(),
    category,
    event,
    details,
    level,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
