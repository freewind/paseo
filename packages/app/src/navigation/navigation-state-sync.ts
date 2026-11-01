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
/** 到达是一阵一阵的（打开工作区、多个 tab 落定），每阵写一次就够。 */
const SYNC_DEBOUNCE_MS = 500;
const RESTORE_RETRY_MS = 1500;
const RESTORE_MAX_ATTEMPTS = 10;

let cachedDeviceKey: string | null = null;

/**
 * 每个浏览器一份的稳定 key，让这台设备的栈保持独立。两个窗口走不同路径时，
 * 不能互相覆盖对方的游标。
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
    // 存储被挡只会让这台设备下次启动换一个新 key。
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

/** 任一已连接并声明该能力的主机都能存这份文件；老主机只在内存里保留状态。 */
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
 * 把导航历史镜像到 daemon。
 *
 * 恢复必须先完成：在它落地前写，会用应用碰巧打开的那一个位置覆盖存好的路径。
 * 所以读成功之前不写；客户端还在连接时，读失败会重试。
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
      // 写失败会让 `lastWritten` 领先于 daemon；下一次变化会重试。
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
        // 与恢复赛跑的那次到达现在已并入存好的路径，不会丢。
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
