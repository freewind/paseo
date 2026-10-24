import { appLogSync } from "./app-log";

/**
 * 之前没人接管 `ErrorUtils` 和 `window.onerror`，手机上崩溃后日志是空的。
 * 这里装一层包装：同步记下错误（致命错误不给微任务下一次机会），再交给原处理器，
 * React Native 自己的红屏与收尾流程原样不动。
 */

interface ErrorUtilsGlobal {
  getGlobalHandler(): ErrorHandler;
  setGlobalHandler(handler: ErrorHandler): void;
}

type ErrorHandler = (error: unknown, isFatal: boolean) => void;

let installed = false;

function getErrorUtils(): ErrorUtilsGlobal | null {
  const candidate: unknown = Reflect.get(globalThis, "ErrorUtils");
  if (!candidate || typeof candidate !== "object") return null;
  const maybeErrorUtils = candidate as Partial<ErrorUtilsGlobal>;
  return typeof maybeErrorUtils.setGlobalHandler === "function"
    ? (candidate as ErrorUtilsGlobal)
    : null;
}

function recordCrash(event: string, details: Record<string, unknown>): void {
  appLogSync("crash", event, details, "error");
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  try {
    return typeof error === "string" ? error : JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function installErrorUtilsHandler(errorUtils: ErrorUtilsGlobal): void {
  const previousHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    recordCrash("global-handler", {
      isFatal,
      error: describeError(error),
      previousHandler: typeof previousHandler === "function",
    });
    previousHandler(error, isFatal);
  });
}

function installWindowHandlers(target: Window): void {
  target.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = (event as PromiseRejectionEvent).reason;
    recordCrash("unhandled-rejection", { error: describeError(reason) });
  });
  target.addEventListener("error", (event) => {
    const errorEvent = event as ErrorEvent;
    recordCrash("window-error", {
      message: errorEvent.message,
      source: errorEvent.filename,
      line: errorEvent.lineno,
      column: errorEvent.colno,
      error: describeError(errorEvent.error ?? errorEvent.message),
    });
  });
}

export function installGlobalErrorLogging(): void {
  if (installed) return;
  installed = true;

  try {
    const errorUtils = getErrorUtils();
    if (errorUtils) {
      installErrorUtilsHandler(errorUtils);
    }
  } catch {
    // 日志绝不能成为应用启动失败的原因。
  }

  try {
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      installWindowHandlers(window);
    }
  } catch {}
}
