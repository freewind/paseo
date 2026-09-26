import { appLogSync } from "./app-log";

/**
 * Crash reporting for the app-side log file. React Native routes every uncaught
 * JavaScript error — including the fatal ones that kill the process — through the
 * `ErrorUtils` global handler, and browsers report theirs through `window.onerror` /
 * `unhandledrejection`. Nothing registered those before, so a crash on the phone left the
 * log file empty and the app simply vanished. This installs a wrapper that records the
 * error first (synchronously, because a fatal error gives the microtask queue no further
 * turn) and then delegates to the handler it replaced, keeping React Native's own fatal
 * behaviour — the dev red box, the release teardown — untouched.
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
    // Logging must never be the reason the app fails to start.
  }

  try {
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      installWindowHandlers(window);
    }
  } catch {
    // Same rule as above.
  }
}
