import { Directory, File, Paths } from "expo-file-system";
import { formatLogLine, rotateLogContent, shouldRotate, type LogLevel } from "./app-log-core";

/**
 * 每个事件一行，写进应用文档目录，同时镜像到控制台（`adb logcat` 能看到）。
 * 写入串在一条 promise 链上，调用方永不阻塞，失败也不报错。
 * `appLogSync` 给崩溃路径用：致命错误不会给微任务下一次机会。
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
    // 静默：日志绝不打扰用户。
  }
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

function buildLine(category: string, event: string, details: unknown, level: LogLevel): string {
  return formatLogLine({
    timestamp: new Date().toISOString(),
    category,
    event,
    details,
    level,
  });
}

export function appLog(
  category: string,
  event: string,
  details?: unknown,
  level: LogLevel = "info",
): void {
  const line = buildLine(category, event, details, level);
  mirrorToConsole(line, level);
  writeChain = writeChain.then(() => writeLine(line)).catch(() => {});
}

/** 崩溃路径上的阻塞版本，此时挂起的 promise 链可能永远轮不到。 */
export function appLogSync(
  category: string,
  event: string,
  details?: unknown,
  level: LogLevel = "info",
): void {
  const line = buildLine(category, event, details, level);
  mirrorToConsole(line, level);
  writeLine(line);
}
