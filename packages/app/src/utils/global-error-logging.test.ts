import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appLogSync = vi.fn();
vi.mock("./app-log", () => ({ appLogSync }));

interface ErrorUtilsStub {
  getGlobalHandler: () => (error: unknown, isFatal: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal: boolean) => void) => void;
}

function installStubErrorUtils(): {
  errorUtils: ErrorUtilsStub;
  previousCalls: Array<{ error: unknown; isFatal: boolean }>;
  report: (error: unknown, isFatal: boolean) => void;
} {
  const previousCalls: Array<{ error: unknown; isFatal: boolean }> = [];
  let handler: (error: unknown, isFatal: boolean) => void = (error, isFatal) => {
    previousCalls.push({ error, isFatal });
  };
  const errorUtils: ErrorUtilsStub = {
    getGlobalHandler: () => handler,
    setGlobalHandler: (next) => {
      handler = next;
    },
  };
  vi.stubGlobal("ErrorUtils", errorUtils);
  return { errorUtils, previousCalls, report: (error, isFatal) => handler(error, isFatal) };
}

describe("installGlobalErrorLogging", () => {
  beforeEach(() => {
    appLogSync.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("logs the crash and still calls the handler it replaced", async () => {
    vi.resetModules();
    const { installGlobalErrorLogging: install } = await import("./global-error-logging");
    const stub = installStubErrorUtils();

    install();
    stub.report(new Error("boom"), true);

    expect(appLogSync).toHaveBeenCalledWith(
      "crash",
      "global-handler",
      expect.objectContaining({ isFatal: true }),
      "error",
    );
    expect(appLogSync.mock.calls[0][2].error).toContain("boom");
    expect(stub.previousCalls).toEqual([{ error: expect.any(Error), isFatal: true }]);
  });

  it("keeps the reporter installed once when called repeatedly", async () => {
    vi.resetModules();
    const { installGlobalErrorLogging: install } = await import("./global-error-logging");
    const stub = installStubErrorUtils();

    install();
    const afterFirst = stub.errorUtils.getGlobalHandler();
    install();

    expect(stub.errorUtils.getGlobalHandler()).toBe(afterFirst);
  });

  it("does nothing when ErrorUtils is missing", async () => {
    vi.resetModules();
    const { installGlobalErrorLogging: install } = await import("./global-error-logging");
    vi.stubGlobal("ErrorUtils", undefined);

    expect(() => install()).not.toThrow();
    expect(appLogSync).not.toHaveBeenCalled();
  });
});
