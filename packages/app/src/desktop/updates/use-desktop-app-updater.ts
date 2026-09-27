import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  checkDesktopAppUpdate,
  formatVersionWithPrefix,
  installDesktopAppUpdate,
  shouldRunDesktopUpdateCheck,
  shouldShowDesktopUpdateSection,
  type DesktopAppUpdateCheckResult,
  type DesktopAppUpdateCheckIntent,
  type DesktopAppUpdateInstallResult,
} from "@/desktop/updates/desktop-updates";
import { useDesktopSettings } from "@/desktop/settings/desktop-settings";
import { useDesktopIpcErrorReporter } from "@/desktop/hooks/desktop-ipc-error";
import {
  PENDING_RECHECK_MS,
  createDesktopAppUpdater,
  formatStatusText,
  type DesktopAppUpdateStatus,
} from "@/desktop/updates/desktop-app-updater";
import { formatMessageTimestamp } from "@/utils/time";

export type { DesktopAppUpdateStatus };

export interface UseDesktopAppUpdaterReturn {
  isDesktopApp: boolean;
  autoCheckUpdates: boolean;
  status: DesktopAppUpdateStatus;
  statusText: string;
  availableUpdate: DesktopAppUpdateCheckResult | null;
  errorMessage: string | null;
  lastCheckedAt: number | null;
  isChecking: boolean;
  isInstalling: boolean;
  checkForUpdates: (options?: {
    intent?: DesktopAppUpdateCheckIntent;
    silent?: boolean;
  }) => Promise<DesktopAppUpdateCheckResult | null>;
  installUpdate: () => Promise<DesktopAppUpdateInstallResult | null>;
}

export function useDesktopAppUpdater(): UseDesktopAppUpdaterReturn {
  const isDesktopApp = shouldShowDesktopUpdateSection();
  const { settings: desktopSettings, isLoading: isLoadingSettings } = useDesktopSettings();
  const releaseChannel = desktopSettings.releaseChannel;
  const autoCheckUpdates = desktopSettings.autoCheckUpdates;
  const settingsLoaded = !isLoadingSettings;
  const reportError = useDesktopIpcErrorReporter();

  const updater = useMemo(
    () =>
      createDesktopAppUpdater({
        port: {
          checkDesktopAppUpdate,
          installDesktopAppUpdate,
        },
        now: () => Date.now(),
        reportInstallError: reportError,
      }),
    [reportError],
  );

  const snapshot = useSyncExternalStore(
    updater.subscribe,
    updater.getSnapshot,
    updater.getSnapshot,
  );

  const checkForUpdates = useCallback(
    async (options: { intent?: DesktopAppUpdateCheckIntent; silent?: boolean } = {}) => {
      const intent = options.intent ?? "manual";
      if (
        !shouldRunDesktopUpdateCheck({ isDesktopApp, autoCheckUpdates, settingsLoaded, intent })
      ) {
        return null;
      }
      return updater.checkForUpdates({
        releaseChannel,
        intent,
        silent: options.silent,
      });
    },
    [autoCheckUpdates, isDesktopApp, releaseChannel, settingsLoaded, updater],
  );

  const installUpdate = useCallback(async () => {
    if (!isDesktopApp) {
      return null;
    }
    return updater.installUpdate({ releaseChannel });
  }, [isDesktopApp, releaseChannel, updater]);

  useEffect(() => {
    if (
      !shouldRunDesktopUpdateCheck({
        isDesktopApp,
        autoCheckUpdates,
        settingsLoaded,
        intent: "automatic",
      })
    ) {
      return;
    }
    void checkForUpdates({ intent: "automatic", silent: true });
  }, [autoCheckUpdates, checkForUpdates, isDesktopApp, settingsLoaded]);

  useEffect(() => {
    if (
      !shouldRunDesktopUpdateCheck({
        isDesktopApp,
        autoCheckUpdates,
        settingsLoaded,
        intent: "automatic",
      }) ||
      snapshot.status !== "pending"
    ) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void checkForUpdates({ intent: "automatic", silent: true });
    }, PENDING_RECHECK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [autoCheckUpdates, checkForUpdates, isDesktopApp, settingsLoaded, snapshot.status]);

  return {
    isDesktopApp,
    autoCheckUpdates,
    status: snapshot.status,
    statusText: formatStatusText({
      status: snapshot.status,
      availableUpdate: snapshot.availableUpdate,
      installMessage: snapshot.installMessage,
      lastCheckedAt: snapshot.lastCheckedAt,
      formatVersion: formatVersionWithPrefix,
      formatLastCheckedAt: (timestamp) => formatMessageTimestamp(new Date(timestamp)),
    }),
    availableUpdate: snapshot.availableUpdate,
    errorMessage: snapshot.errorMessage,
    lastCheckedAt: snapshot.lastCheckedAt,
    isChecking: snapshot.isChecking,
    isInstalling: snapshot.isInstalling,
    checkForUpdates,
    installUpdate,
  };
}
