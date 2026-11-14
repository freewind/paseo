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
 * 历史主要在独立 agent 的 chat 之间走；布局还在水合时先记一条工作区占位，
 * 等聚焦 tab 出现再就地升级。见 `isAgentChatEntry` 与 `isPendingWorkspaceEntry`。
 */
export interface NavigationHistoryEntry {
  pathname: string;
  serverId: string | null;
  workspaceId: string | null;
  target: WorkspaceTabTarget | null;
  tabId: string | null;
}

export interface NavigationHistorySnapshot {
  entries: readonly NavigationHistoryEntry[];
  /** 当前所在位置在 `entries` 中的下标。 */
  cursor: number;
  /**
   * 当前位置不在历史里：历史列表、设置页、终端这类不占一步的页面。
   * 光标不动，但「返回」应当仍可用，退回去就是光标所在的那一步。
   */
  currentOutsideHistory: boolean;
  /** 前进/后退跳转还在落地时设置；消费方只应用一次。 */
  replay: { token: number; entry: NavigationHistoryEntry } | null;
}

/** 只会用到最近 20 步；再往前的方向键已经没人会按，存着只是占地方。 */
const MAX_ENTRIES = 20;
const REPLAY_TIMEOUT_MS = 2000;

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
 * 该位置是不是独立 agent 的 chat。只有它会在前进/后退之间走。
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

/**
 * 布局还在水合时的占位：只知道到了哪个工作区，还不知道聚焦哪个 tab。
 * 有了它，「打开应用、还在加载当前 agent 就离开」这件事也留得下一步可返回；
 * 真实的聚焦 tab 出现后由 `recordNavigation` 就地升级，不会多出一条。
 */
function isPendingWorkspaceEntry(entry: NavigationHistoryEntry): boolean {
  return !entry.target && Boolean(entry.serverId) && Boolean(entry.workspaceId);
}

export function createNavigationHistoryStore(options: { replayTimeoutMs?: number } = {}): {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => NavigationHistorySnapshot;
  recordNavigation: (entry: NavigationHistoryEntry) => void;
  navigateBack: () => boolean;
  navigateForward: () => boolean;
} {
  const replayTimeoutMs = options.replayTimeoutMs ?? REPLAY_TIMEOUT_MS;
  const listeners = new Set<() => void>();
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let nextToken = 1;
  let snapshot: NavigationHistorySnapshot = {
    entries: [],
    cursor: -1,
    currentOutsideHistory: false,
    replay: null,
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
    });
    replayTimer = setTimeout(() => {
      replayTimer = null;
      if (snapshot.replay?.token === token) {
        // 目标始终没有出现（agent 被删、路由拒绝）。解冻记录，
        // 不要因此吞掉之后每一次用户操作。
        emit({ ...snapshot, replay: null });
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
    if (!isAgentChatEntry(entry) && !isPendingWorkspaceEntry(entry)) {
      // 停在不入历史的页面（历史列表、设置页、终端等）：光标原地不动，
      // 只记下“当前位置在历史之外”，让「返回」仍可点。
      if (!snapshot.currentOutsideHistory) {
        emit({ ...snapshot, currentOutsideHistory: true });
      }
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
          currentOutsideHistory: false,
          replay: null,
        });
      }
      return;
    }

    const current = snapshot.cursor >= 0 ? snapshot.entries[snapshot.cursor] : null;
    if (current && entriesEqual(current, entry)) {
      // 回到光标所在的位置（例如从历史列表退回那个 agent）：只清掉“在历史之外”的标记。
      if (snapshot.currentOutsideHistory) {
        emit({ ...snapshot, currentOutsideHistory: false });
      }
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
      currentOutsideHistory: false,
      replay: null,
    });
  }

  function jump(delta: -1 | 1): boolean {
    // 停在历史之外的页面时只有「返回」有意义：回到光标所在的那一步，光标不动。
    if (delta === -1 && snapshot.currentOutsideHistory && snapshot.cursor >= 0) {
      const entry = snapshot.entries[snapshot.cursor];
      emit({ ...snapshot, currentOutsideHistory: false });
      beginReplay(entry);
      return true;
    }
    const targetIndex = snapshot.cursor + delta;
    if (targetIndex < 0 || targetIndex >= snapshot.entries.length) {
      return false;
    }
    const entry = snapshot.entries[targetIndex];
    emit({ ...snapshot, cursor: targetIndex });
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
    recordNavigation,
    navigateBack: () => jump(-1),
    navigateForward: () => jump(1),
  };
}

export const navigationHistoryStore = createNavigationHistoryStore();
