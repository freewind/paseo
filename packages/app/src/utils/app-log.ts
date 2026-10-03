import { Directory, File, Paths } from "expo-file-system";
import { formatLogLine, rotateLogContent, shouldRotate, type LogLevel } from "./app-log-core";

/**
 * App-side file logger for the recently shipped features. Writes one line per event to
 * `<documentDirectory>/logs/paseo-app.log` (Android: `/data/data/sh.paseo/files/logs/`,
 * fetchable via `adb pull`). Native writes are serialized through a promise chain so
 * callers never block; write failures are swallowed — logging must never affect the app.
 * Console mirrors the line so `adb logcat` sees it too during development.
 */

let logFile: File | null = null;
let writeChain: Promise<void> = Promise.resolve();

function resolveLogFile(): File | null {
  if (logFile) return logFile;
  try {
    const directory = new Directory(Paths.document, "logs");
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true });
    }
    const file = new File(directory, "paseo-app.log");
    if (!file.exists) {
      file.create({ intermediates: true });
    }
    logFile = file;
  } catch {
    logFile = null;
  }
  return logFile;
}

function writeLine(line: string): void {
  const file = resolveLogFile();
  if (!file) return;
  try {
    const existing = file.exists ? file.textSync() : "";
    const appended = existing.length === 0 ? line : `${existing}\n${line}`;
    file.write(shouldRotate(file.size) ? rotateLogContent(appended) : appended);
  } catch {
    // Silent: logging must never surface to the user.
  }
}

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
  writeChain = writeChain.then(() => writeLine(line)).catch(() => {});
}
