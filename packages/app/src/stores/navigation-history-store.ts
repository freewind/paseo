import {
  normalizeWorkspaceTabTarget,
  workspaceTabPositionsEqual,
  workspaceTabTargetsEqual,
} from "@/workspace-tabs/identity";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

/**
 * One visited position: the app page plus the focused workspace tab. The tab
 * target is what makes a Chat switch visible to history — switching tabs inside
 * a workspace never changes the pathname, so the route stack alone cannot
 * represent it. `tabId` is the focused tab's instance, so two tabs sharing one
 * target stay apart when the jump has to land on a specific one.
 *
 * Only main agent chats are positions the history walks: see
 * `isAgentChatEntry`.
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
 * An agent the user actually looked at, most recent first. Kept beside
 * `entries` on purpose: history is a path you walk back along, so opening a new
 * branch or walking that path must not lose the other agents you were just in.
 */
export interface RecentAgentVisit {
  serverId: string;
  workspaceId: string;
  agentId: string;
}

export interface NavigationHistorySnapshot {
  entries: readonly NavigationHistoryEntry[];
  /** Index of the current position in `entries`. */
  cursor: number;
  /** Set while a back/forward jump is settling; consumers apply it once. */
  replay: NavigationHistoryReplay | null;
  /** Agents the user visited, most recent first, deduplicated. */
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
  reset: () => void;
}

export interface NavigationHistoryStoreOptions {
  replayTimeoutMs?: number;
}

const MAX_ENTRIES = 100;
const REPLAY_TIMEOUT_MS = 2000;
/** Enough to cover a working session; the full-page History covers the rest. */
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
 * Stable string form of a tab target. Used as a `useSyncExternalStore`
 * snapshot fragment: a string keeps `Object.is` stable across selector calls
 * even though the underlying tab objects are rebuilt on every layout update.
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
 * Same visited position, including which tab instance was focused. Two blank
 * tabs in one workspace are two positions: neither is the other, and switching
 * between them is worth remembering.
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
 * Whether an observation is the position a jump was heading to. Arrival ignores
 * the instance: a blank tab recreated for the jump carries a new id, and the
 * jump still arrived. `rebindReplayInstance` then keeps the recorded id current.
 */
function replayArrived(observed: NavigationHistoryEntry, target: NavigationHistoryEntry): boolean {
  return (
    observed.pathname === target.pathname &&
    workspaceTabPositionsEqual(observed.target, target.target)
  );
}

/**
 * Points the settled position at the instance that actually showed up, so the
 * next jump to it focuses the tab instead of creating another one.
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
 * Whether a position is a main agent chat, which is the only thing Back and
 * Forward walk between and the only thing the recent visits list holds. Pages,
 * blank tabs, drafts, files, terminals, diffs and subagent panels are positions
 * the user passed through, not somewhere they "were just in".
 */
function isAgentChatEntry(entry: NavigationHistoryEntry): entry is NavigationHistoryEntry & {
  target: { kind: "agent"; agentId: string };
  serverId: string;
  workspaceId: string;
} {
  return entry.target?.kind === "agent" && Boolean(entry.serverId) && Boolean(entry.workspaceId);
}

/** The agent behind a position, when that position is a main agent chat. */
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
 * Moves the visited agent to the front and keeps one entry per agent per
 * workspace, so returning to an agent reorders the list instead of appending
 * another copy of it.
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
        // The target never became observable (agent deleted, route refused).
        // Unfreeze recording instead of swallowing every later user action.
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

    // Everything else the app can show — pages, drafts, blank tabs, files,
    // terminals, diffs, subagent panels — is not a position to walk back to.
    if (!isAgentChatEntry(entry)) {
      return;
    }

    if (snapshot.replay) {
      // Replay is in flight: the only interesting observation is arrival at the
      // target. Anything else is an intermediate state of the jump itself (or a
      // navigation the user started too quickly) and must not be recorded.
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
