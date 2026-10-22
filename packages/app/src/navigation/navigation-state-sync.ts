import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { NavigationStackEntry, NavigationState } from "@getpaseo/protocol/messages";
import { isWeb } from "@/constants/platform";
import { getHostRuntimeStore, isHostRuntimeConnected } from "@/runtime/host-runtime";
import {
  canonicalTargetKey,
  navigationHistoryStore,
  type NavigationHistoryEntry,
  type NavigationHistorySnapshot,
  type RecentAgentVisit,
} from "@/stores/navigation-history-store";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";

const DEVICE_KEY_STORAGE_KEY = "paseo.navigation.device-key";
/** Arrivals arrive in bursts (open a workspace, several tabs settle); one write per burst is enough. */
const SYNC_DEBOUNCE_MS = 500;
const RESTORE_RETRY_MS = 1500;
const RESTORE_MAX_ATTEMPTS = 10;

let cachedDeviceKey: string | null = null;

/**
 * A stable per-browser key, so this device's stack stays its own. Two windows walking different
 * paths must not overwrite each other's cursor.
 */
export function resolveNavigationDeviceKey(): string {
  if (cachedDeviceKey) {
    return cachedDeviceKey;
  }
  const stored = readStoredDeviceKey();
  if (stored) {
    cachedDeviceKey = stored;
    return stored;
  }
  const created = `dev_${globalThis.crypto.randomUUID()}`;
  writeStoredDeviceKey(created);
  cachedDeviceKey = created;
  return created;
}

function readStoredDeviceKey(): string | null {
  try {
    return globalThis.localStorage?.getItem(DEVICE_KEY_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStoredDeviceKey(value: string): void {
  try {
    globalThis.localStorage?.setItem(DEVICE_KEY_STORAGE_KEY, value);
  } catch {
    // Blocked storage only costs the device a new key on the next launch.
  }
}

function toWireEntry(entry: NavigationHistoryEntry): NavigationStackEntry {
  return {
    pathname: entry.pathname,
    serverId: entry.serverId,
    workspaceId: entry.workspaceId,
    targetKey: entry.target ? canonicalTargetKey(entry.target) : null,
    tabId: entry.tabId,
  };
}

function fromWireTarget(targetKey: string | null) {
  if (!targetKey) {
    return null;
  }
  try {
    return normalizeWorkspaceTabTarget(JSON.parse(targetKey));
  } catch {
    return null;
  }
}

export function toNavigationState(snapshot: NavigationHistorySnapshot): NavigationState {
  return {
    recentVisits: snapshot.recentAgentVisits.map((visit) => ({ ...visit })),
    stack: {
      entries: snapshot.entries.map(toWireEntry),
      cursor: snapshot.cursor,
    },
  };
}

export function fromNavigationState(state: NavigationState): {
  entries: NavigationHistoryEntry[];
  cursor: number;
  recentAgentVisits: RecentAgentVisit[];
} {
  return {
    entries: (state.stack?.entries ?? []).map((entry) => ({
      pathname: entry.pathname,
      serverId: entry.serverId,
      workspaceId: entry.workspaceId,
      target: fromWireTarget(entry.targetKey),
      tabId: entry.tabId,
    })),
    cursor: state.stack?.cursor ?? -1,
    recentAgentVisits: state.recentVisits.map((visit) => ({ ...visit })),
  };
}

/** Any connected host that advertises the feature owns the file; older hosts keep the state in memory. */
function resolveSyncClient(): DaemonClient | null {
  const store = getHostRuntimeStore();
  for (const host of store.getHosts()) {
    if (!isHostRuntimeConnected(store.getSnapshot(host.serverId))) {
      continue;
    }
    const client = store.getClient(host.serverId);
    if (client?.getLastServerInfoMessage()?.features?.navigationState === true) {
      return client;
    }
  }
  return null;
}

/**
 * Mirrors the navigation history to the daemon.
 *
 * The restore has to win first: writing before it lands would overwrite the stored path with the
 * one entry the app happened to open on. So nothing is written until a read succeeds, and a read
 * that cannot run yet is retried while the client is still connecting.
 */
export function startNavigationStateSync(): () => void {
  if (!isWeb) {
    return () => undefined;
  }
  const deviceKey = resolveNavigationDeviceKey();
  let disposed = false;
  let ready = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastWritten = "";

  const write = () => {
    writeTimer = null;
    if (!ready || disposed) {
      return;
    }
    const client = resolveSyncClient();
    if (!client) {
      return;
    }
    const state = toNavigationState(navigationHistoryStore.getSnapshot());
    const wire = JSON.stringify(state);
    if (wire === lastWritten) {
      return;
    }
    lastWritten = wire;
    void client.setNavigationState(deviceKey, state).catch(() => {
      // A failed write leaves `lastWritten` ahead of the daemon; the next change retries.
      lastWritten = "";
    });
  };

  const scheduleWrite = () => {
    if (writeTimer !== null) {
      clearTimeout(writeTimer);
    }
    writeTimer = setTimeout(write, SYNC_DEBOUNCE_MS);
  };

  const restore = () => {
    retryTimer = null;
    if (disposed) {
      return;
    }
    const client = resolveSyncClient();
    if (!client) {
      retry();
      return;
    }
    void client
      .getNavigationState(deviceKey)
      .then((state) => {
        if (disposed) {
          return undefined;
        }
        navigationHistoryStore.restore(fromNavigationState(state));
        lastWritten = JSON.stringify(toNavigationState(navigationHistoryStore.getSnapshot()));
        ready = true;
        // The arrival that raced the restore is now part of the stored path, so nothing is lost.
        scheduleWrite();
        return undefined;
      })
      .catch(() => retry());
  };

  const retry = () => {
    if (disposed || attempts >= RESTORE_MAX_ATTEMPTS) {
      return;
    }
    attempts += 1;
    retryTimer = setTimeout(restore, RESTORE_RETRY_MS);
  };

  restore();
  const unsubscribe = navigationHistoryStore.subscribe(scheduleWrite);

  return () => {
    disposed = true;
    unsubscribe();
    if (writeTimer !== null) clearTimeout(writeTimer);
    if (retryTimer !== null) clearTimeout(retryTimer);
  };
}
