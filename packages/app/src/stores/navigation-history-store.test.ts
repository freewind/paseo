import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalTargetKey,
  createNavigationHistoryStore,
  type NavigationHistoryEntry,
} from "./navigation-history-store";

function entry(
  pathname: string,
  target: NavigationHistoryEntry["target"] = null,
  tabId: string | null = null,
): NavigationHistoryEntry {
  const isWorkspace = pathname.startsWith("/h/server-1/workspace/");
  return {
    pathname,
    serverId: isWorkspace ? "server-1" : null,
    workspaceId: isWorkspace ? (pathname.split("/")[4] ?? null) : null,
    target,
    tabId,
  };
}

describe("navigation history store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the first position without back history", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(entry("/h/server-1/workspace/workspace-a"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.cursor).toBe(0);
    expect(store.getCanGoBack()).toBe(false);
    expect(store.getCanGoForward()).toBe(false);
  });

  it("appends a distinct entry and advances the cursor", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(entry("/h/server-1/workspace/workspace-a"));
    store.recordNavigation(entry("/h/server-1/workspace/workspace-b"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.cursor).toBe(1);
    expect(store.getCanGoBack()).toBe(true);
    expect(store.getCanGoForward()).toBe(false);
  });

  it("ignores repeated observations of the current position", () => {
    const store = createNavigationHistoryStore();
    const target = { kind: "agent" as const, agentId: "agent-1" };

    store.recordNavigation(entry("/h/server-1/workspace/workspace-a", target));
    store.recordNavigation(entry("/h/server-1/workspace/workspace-a", target));

    expect(store.getSnapshot().entries).toHaveLength(1);
  });

  it("records a Chat switch that keeps the same pathname", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "agent", agentId: "agent-1" }),
    );
    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "agent", agentId: "agent-2" }),
    );

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.cursor).toBe(1);
    expect(snapshot.entries[1].target).toEqual({ kind: "agent", agentId: "agent-2" });
  });

  it("goes back and forward across recorded entries", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(entry("/a"));
    store.recordNavigation(entry("/b"));
    store.recordNavigation(entry("/c"));

    expect(store.navigateBack()).toBe(true);
    expect(store.getSnapshot().cursor).toBe(1);
    expect(store.getSnapshot().replay?.entry.pathname).toBe("/b");
    expect(store.getCanGoForward()).toBe(true);

    expect(store.navigateForward()).toBe(true);
    expect(store.getSnapshot().cursor).toBe(2);
    expect(store.getSnapshot().replay?.entry.pathname).toBe("/c");
    expect(store.getCanGoForward()).toBe(false);
  });

  it("stops at both ends of the history", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(entry("/a"));
    store.recordNavigation(entry("/b"));

    expect(store.navigateForward()).toBe(false);
    expect(store.navigateBack()).toBe(true);
    expect(store.navigateBack()).toBe(false);
    expect(store.getSnapshot().cursor).toBe(0);
  });

  it("drops the forward branch after recording past a back jump", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(entry("/a"));
    store.recordNavigation(entry("/b"));
    store.recordNavigation(entry("/c"));

    store.navigateBack();
    store.navigateBack();
    // Land on /a and let the replay settle before the user navigates again.
    store.recordNavigation(entry("/a"));

    store.recordNavigation(entry("/d"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries.map((item) => item.pathname)).toEqual(["/a", "/d"]);
    expect(store.getCanGoForward()).toBe(false);
  });

  it("accepts the replay target without appending an entry", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(entry("/a"));
    store.recordNavigation(entry("/b"));

    store.navigateBack();
    store.recordNavigation(entry("/a"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.replay).toBeNull();
    expect(snapshot.cursor).toBe(0);
  });

  it("discards observations that do not match an in-flight replay", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(entry("/a"));
    store.recordNavigation(entry("/b"));

    store.navigateBack();
    // Intermediate state observed while the jump is still settling.
    store.recordNavigation(entry("/partial"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries.map((item) => item.pathname)).toEqual(["/a", "/b"]);
    expect(snapshot.replay).not.toBeNull();
  });

  it("resumes recording after the replay timeout expires", () => {
    const store = createNavigationHistoryStore({ replayTimeoutMs: 500 });
    store.recordNavigation(entry("/a"));
    store.recordNavigation(entry("/b"));

    store.navigateBack();
    vi.advanceTimersByTime(500);

    expect(store.getSnapshot().replay).toBeNull();
    store.recordNavigation(entry("/c"));
    expect(store.getSnapshot().entries.map((item) => item.pathname)).toEqual(["/a", "/c"]);
  });

  it("caps the history length", () => {
    const store = createNavigationHistoryStore();

    for (let index = 0; index < 120; index += 1) {
      store.recordNavigation(entry(`/page-${index}`));
    }

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(100);
    expect(snapshot.cursor).toBe(99);
    expect(snapshot.entries[0].pathname).toBe("/page-20");
    expect(store.navigateBack()).toBe(true);
  });

  it("treats equivalent targets as the same position", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(
      entry(
        "/h/server-1/workspace/workspace-a",
        { kind: "agent", agentId: "agent-1" },
        "agent_agent-1",
      ),
    );
    store.recordNavigation(
      entry(
        "/h/server-1/workspace/workspace-a",
        { kind: "agent", agentId: "agent-1" },
        "agent_agent-1",
      ),
    );

    expect(store.getSnapshot().entries).toHaveLength(1);
  });

  it("keeps two blank tabs apart, because the instance is the position", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "new_tab" }, "tab_1"),
    );
    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "new_tab" }, "tab_2"),
    );

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries.map((item) => item.tabId)).toEqual(["tab_1", "tab_2"]);
    expect(store.getCanGoBack()).toBe(true);
  });

  it("settles a jump onto a blank tab that had to be created again", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "new_tab" }, "tab_1"),
    );
    store.recordNavigation(
      entry(
        "/h/server-1/workspace/workspace-a",
        { kind: "agent", agentId: "agent-1" },
        "agent_agent-1",
      ),
    );

    store.navigateBack();
    // The recorded instance is gone, so the jump opened a fresh blank tab.
    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "new_tab" }, "tab_9"),
    );

    const snapshot = store.getSnapshot();
    expect(snapshot.replay).toBeNull();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.cursor).toBe(0);
    expect(snapshot.entries[0].tabId).toBe("tab_9");
  });

  it("keeps the recorded instance when the jump finds it again", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "new_tab" }, "tab_1"),
    );
    store.recordNavigation(
      entry(
        "/h/server-1/workspace/workspace-a",
        { kind: "agent", agentId: "agent-1" },
        "agent_agent-1",
      ),
    );

    store.navigateBack();
    store.recordNavigation(
      entry("/h/server-1/workspace/workspace-a", { kind: "new_tab" }, "tab_1"),
    );

    const snapshot = store.getSnapshot();
    expect(snapshot.replay).toBeNull();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0].tabId).toBe("tab_1");
  });

  it("resets to an empty history", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(entry("/a"));
    store.navigateBack();

    store.reset();

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(0);
    expect(snapshot.cursor).toBe(-1);
    expect(snapshot.replay).toBeNull();
    expect(store.getCanGoBack()).toBe(false);
  });

  it("notifies subscribers on every snapshot change", () => {
    const store = createNavigationHistoryStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.recordNavigation(entry("/a"));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.recordNavigation(entry("/b"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("builds a stable canonical key for tab targets", () => {
    expect(canonicalTargetKey(null)).toBe("");
    expect(canonicalTargetKey({ kind: "agent", agentId: "agent-1" })).toBe(
      canonicalTargetKey({ agentId: "agent-1", kind: "agent" }),
    );
    expect(canonicalTargetKey({ kind: "agent", agentId: "agent-1" })).not.toBe(
      canonicalTargetKey({ kind: "agent", agentId: "agent-2" }),
    );
  });
});
