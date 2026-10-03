/** @vitest-environment jsdom */
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesktopAppUpdater } from "./use-desktop-app-updater";

const state = vi.hoisted(() => ({
  autoCheckUpdates: true,
  commands: [] as string[],
  reportError: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/desktop/host", () => ({
  isElectronRuntime: () => true,
  isElectronRuntimeMac: () => true,
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ error: vi.fn(), info: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/desktop/hooks/desktop-ipc-error", () => ({
  useDesktopIpcErrorReporter: () => state.reportError,
  useDesktopIpcQueryErrorToast: () => undefined,
}));
vi.mock("@/desktop/electron/invoke", () => ({
  invokeDesktopCommand: vi.fn(async (command: string) => {
    state.commands.push(command);
    if (command === "get_desktop_settings") {
      return {
        releaseChannel: "stable",
        autoCheckUpdates: state.autoCheckUpdates,
        notifications: { playSound: true },
        daemon: { manageBuiltInDaemon: true, keepRunningAfterQuit: false },
      };
    }
    if (command === "check_app_update") {
      return {
        hasUpdate: false,
        readyToInstall: false,
        currentVersion: "1.0.0",
        latestVersion: null,
        body: null,
        date: null,
        errorMessage: null,
      };
    }
    return null;
  }),
}));

function flushPendingEffects(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 50);
  return promise;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("useDesktopAppUpdater automatic checks", () => {
  beforeEach(() => {
    state.autoCheckUpdates = true;
    state.commands = [];
  });

  it("checks for updates automatically when the setting is on", async () => {
    const { unmount } = renderHook(() => useDesktopAppUpdater(), { wrapper });

    await waitFor(() => expect(state.commands).toContain("check_app_update"));
    unmount();
  });

  it("skips automatic checks when the setting is off but still allows manual ones", async () => {
    state.autoCheckUpdates = false;
    const { result, unmount } = renderHook(() => useDesktopAppUpdater(), { wrapper });

    await waitFor(() => expect(result.current.autoCheckUpdates).toBe(false));
    await flushPendingEffects();
    expect(state.commands).not.toContain("check_app_update");

    await result.current.checkForUpdates({ intent: "automatic", silent: true });
    expect(state.commands).not.toContain("check_app_update");

    await result.current.checkForUpdates();
    expect(state.commands).toContain("check_app_update");
    unmount();
  });
});
