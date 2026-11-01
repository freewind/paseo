import {
  normalizeWorkspaceTabTarget,
  workspaceTabPositionsEqual,
  workspaceTabTargetsEqual,
} from "@/workspace-tabs/identity";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

/**
 * 一个访问过的位置：应用页面加上该工作区里聚焦的 tab。正是 tab 目标让
 * “切换 Chat”进入历史——在工作区内切 tab 不会改 pathname，光靠路由栈表示不了。
 * `tabId` 是聚焦 tab 的实例，两个 tab 共用同一个目标时，跳转仍能落到具体那一个。
 *
 * 历史只在主 agent chat 之间走：见 `isAgentChatEntry`。
 */
export interface NavigationHistoryEntry {
  pathname: string;
  serverId: string | null;
  workspaceId: string | null;
  target: WorkspaceTabTarget | null;
  tabId: string | null;
}

export interface NavigationHistoryReplay {
  token: number;
  entry: NavigationHistoryEntry;
}

/**
 * 用户真正看过的 agent，最近访问的在前。刻意与 `entries` 分开：历史是一条可以
 * 来回走的路径，另开一条新分支或沿路径回头，都不该丢掉刚待过的其它 agent。
 */
export interface RecentAgentVisit {
  serverId: string;
  workspaceId: string;
  agentId: string;
}

export interface NavigationHistorySnapshot {
  entries: readonly NavigationHistoryEntry[];
  /** 当前所在位置在 `entries` 中的下标。 */
  cursor: number;
  /** 前进/后退跳转还在落地时设置；消费方只应用一次。 */
  replay: NavigationHistoryReplay | null;
  /** 用户访问过的 agent，最近在前，已去重。 */
  recentAgentVisits: readonly RecentAgentVisit[];
  version: number;
}

export interface NavigationHistoryStore {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => NavigationHistorySnapshot;
  getCanGoBack: () => boolean;
  getCanGoForward: () => boolean;
  getRecentAgentVisits: () => readonly RecentAgentVisit[];
  recordNavigation: (entry: NavigationHistoryEntry) => void;
  navigateBack: () => boolean;
  navigateForward: () => boolean;
  /**
   * 用 daemon 存下的内容整份替换历史。启动时只用一次，在任何到达被记录之前，
   * 让刷新继续原来的路径，而不是从空历史开始。
   */
  restore: (input: {
    entries: readonly NavigationHistoryEntry[];
    cursor: number;
    recentAgentVisits: readonly RecentAgentVisit[];
  }) => void;
  reset: () => void;
}

export interface NavigationHistoryStoreOptions {
  replayTimeoutMs?: number;
}

const MAX_ENTRIES = 100;
const REPLAY_TIMEOUT_MS = 2000;
/** 够覆盖一次工作时段；更早的由整页 History 承担。 */
const MAX_RECENT_AGENT_VISITS = 20;

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/**
 * tab 目标的稳定字符串形式。作为 `useSyncExternalStore` 的片段使用：底层 tab
 * 对象每次布局更新都会重建，字符串能让 `Object.is` 在多次 selector 调用间保持稳定。
 */
export function canonicalTargetKey(target: WorkspaceTabTarget | null): string {
  if (!target) {
    return "";
  }
  return stableStringify(target);
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 是否是同一个访问位置，包括聚焦的是哪个 tab 实例。一个工作区里的两个空白 tab
 * 是两个位置，互不相同，期间切换值得记住。
 */
function entriesEqual(a: NavigationHistoryEntry, b: NavigationHistoryEntry): boolean {
  if (a.pathname !== b.pathname || a.tabId !== b.tabId) {
    return false;
  }
  if (!a.target || !b.target) {
    return !a.target && !b.target;
  }
  return workspaceTabTargetsEqual(a.target, b.target);
}

/**
 * 一次观察是不是跳转正要到达的位置。到达判定不管实例：为跳转重建的空白 tab
 * 会带新 id，但仍算到达。随后 `rebindReplayInstance` 把记录的实例改成新的。
 */
function replayArrived(observed: NavigationHistoryEntry, target: NavigationHistoryEntry): boolean {
  return (
    observed.pathname === target.pathname &&
    workspaceTabPositionsEqual(observed.target, target.target)
  );
}

/**
 * 把已落地的位置指向实际出现的实例，下次跳到它时聚焦该 tab，而不是再建一个。
 */
function rebindReplayInstance(
  entries: readonly NavigationHistoryEntry[],
  index: number,
  tabId: string | null,
): readonly NavigationHistoryEntry[] {
  const entry = entries[index];
  if (!entry || entry.tabId === tabId) {
    return entries;
  }
  return entries.map((item, itemIndex) => (itemIndex === index ? { ...item, tabId } : item));
}

/**
 * 该位置是不是主 agent chat。只有它会在前进/后退之间走，也只有它进最近访问。
 * 页面、空白 tab、草稿、文件、终端、diff 与子 agent 面板都只是路过，不是
 * 用户“刚才待过”的地方。
 */
function isAgentChatEntry(entry: NavigationHistoryEntry): entry is NavigationHistoryEntry & {
  target: { kind: "agent"; agentId: string };
  serverId: string;
  workspaceId: string;
} {
  return entry.target?.kind === "agent" && Boolean(entry.serverId) && Boolean(entry.workspaceId);
}

/** 位置是主 agent chat 时返回它对应的 agent。 */
function readRecentAgentVisit(entry: NavigationHistoryEntry): RecentAgentVisit | null {
  if (!isAgentChatEntry(entry)) {
    return null;
  }
  return {
    serverId: entry.serverId,
    workspaceId: entry.workspaceId,
    agentId: entry.target.agentId,
  };
}

function recentAgentVisitsEqual(left: RecentAgentVisit, right: RecentAgentVisit): boolean {
  return (
    left.serverId === right.serverId &&
    left.workspaceId === right.workspaceId &&
    left.agentId === right.agentId
  );
}

/**
 * 把访问到的 agent 移到最前，每个工作区的每个 agent 只留一条：回到某个 agent
 * 只是重排，不会追加一份重复记录。
 */
function withRecentAgentVisit(
  visits: readonly RecentAgentVisit[],
  entry: NavigationHistoryEntry,
): readonly RecentAgentVisit[] {
  const visit = readRecentAgentVisit(entry);
  if (!visit) {
    return visits;
  }
  if (visits[0] && recentAgentVisitsEqual(visits[0], visit)) {
    return visits;
  }
  const rest = visits.filter((item) => !recentAgentVisitsEqual(item, visit));
  return [visit, ...rest].slice(0, MAX_RECENT_AGENT_VISITS);
}

export function createNavigationHistoryStore(
  options: NavigationHistoryStoreOptions = {},
): NavigationHistoryStore {
  const replayTimeoutMs = options.replayTimeoutMs ?? REPLAY_TIMEOUT_MS;
  const listeners = new Set<() => void>();
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let nextToken = 1;
  let snapshot: NavigationHistorySnapshot = {
    entries: [],
    cursor: -1,
    replay: null,
    recentAgentVisits: [],
    version: 0,
  };

  function emit(next: NavigationHistorySnapshot): void {
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function clearReplayTimer(): void {
    if (replayTimer !== null) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
  }

  function beginReplay(entry: NavigationHistoryEntry): void {
    clearReplayTimer();
    const token = nextToken++;
    emit({
      ...snapshot,
      replay: { token, entry },
      version: snapshot.version + 1,
    });
    replayTimer = setTimeout(() => {
      replayTimer = null;
      if (snapshot.replay?.token === token) {
        // 目标始终没有出现（agent 被删、路由拒绝）。解冻记录，
        // 不要因此吞掉之后每一次用户操作。
        emit({ ...snapshot, replay: null, version: snapshot.version + 1 });
      }
    }, replayTimeoutMs);
  }

  function recordNavigation(rawEntry: NavigationHistoryEntry): void {
    const entry: NavigationHistoryEntry = {
      ...rawEntry,
      tabId: trimNonEmpty(rawEntry.tabId),
      target: normalizeWorkspaceTabTarget(rawEntry.target),
    };

    // 应用能显示的其它东西——页面、草稿、空白 tab、文件、终端、diff、子 agent
    // 面板——都不是可以走回去的位置。
    if (!isAgentChatEntry(entry)) {
      return;
    }

    if (snapshot.replay) {
      // 回放进行中：只有到达目标才值得记录。其余都是跳转本身的中间状态
      // （或用户过快开始的新导航），不能写进历史。
      if (replayArrived(entry, snapshot.replay.entry)) {
        clearReplayTimer();
        emit({
          ...snapshot,
          entries: rebindReplayInstance(snapshot.entries, snapshot.cursor, entry.tabId),
          recentAgentVisits: withRecentAgentVisit(snapshot.recentAgentVisits, entry),
          replay: null,
          version: snapshot.version + 1,
        });
      }
      return;
    }

    const current = snapshot.cursor >= 0 ? snapshot.entries[snapshot.cursor] : null;
    if (current && entriesEqual(current, entry)) {
      return;
    }

    const kept = snapshot.cursor >= 0 ? snapshot.entries.slice(0, snapshot.cursor + 1) : [];
    let entries = [...kept, entry];
    let cursor = entries.length - 1;
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
      cursor = entries.length - 1;
    }
    emit({
      entries,
      cursor,
      recentAgentVisits: withRecentAgentVisit(snapshot.recentAgentVisits, entry),
      replay: null,
      version: snapshot.version + 1,
    });
  }

  function jump(delta: -1 | 1): boolean {
    const targetIndex = snapshot.cursor + delta;
    if (targetIndex < 0 || targetIndex >= snapshot.entries.length) {
      return false;
    }
    const entry = snapshot.entries[targetIndex];
    emit({ ...snapshot, cursor: targetIndex, version: snapshot.version + 1 });
    beginReplay(entry);
    return true;
  }

  return {
    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    getSnapshot: () => snapshot,
    getCanGoBack: () => snapshot.cursor > 0,
    getCanGoForward: () => snapshot.cursor >= 0 && snapshot.cursor < snapshot.entries.length - 1,
    getRecentAgentVisits: () => snapshot.recentAgentVisits,
    recordNavigation,
    navigateBack: () => jump(-1),
    navigateForward: () => jump(1),
    restore(input) {
      clearReplayTimer();
      const entries = input.entries.slice(-MAX_ENTRIES);
      const cursor =
        entries.length === 0 ? -1 : Math.min(Math.max(input.cursor, 0), entries.length - 1);
      emit({
        entries,
        cursor,
        replay: null,
        recentAgentVisits: input.recentAgentVisits.slice(0, MAX_RECENT_AGENT_VISITS),
        version: snapshot.version + 1,
      });
      // 恢复的最后位置就是用户重启前待的地方：让桥把这一跳走完，
      // 而不是只把游标摆好、人还停在宿主默认页。
      const entry = cursor >= 0 ? entries[cursor] : undefined;
      if (entry) {
        beginReplay(entry);
      }
    },
    reset() {
      clearReplayTimer();
      emit({
        entries: [],
        cursor: -1,
        replay: null,
        recentAgentVisits: [],
        version: snapshot.version + 1,
      });
    },
  };
}

export const navigationHistoryStore = createNavigationHistoryStore();
