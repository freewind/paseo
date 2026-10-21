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

/** A main agent chat position: the only kind of position the history records. */
function agentEntry(
  pathname: string,
  agentId: string,
  tabId = `agent_${agentId}`,
): NavigationHistoryEntry {
  return entry(pathname, { kind: "agent", agentId }, tabId);
}

const workspaceA = "/h/server-1/workspace/workspace-a";
const workspaceB = "/h/server-1/workspace/workspace-b";

describe("navigation history store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records the first position without back history", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(agentEntry(workspaceA, "agent-1"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.cursor).toBe(0);
    expect(store.getCanGoBack()).toBe(false);
    expect(store.getCanGoForward()).toBe(false);
  });

  it("appends a distinct entry and advances the cursor", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(agentEntry(workspaceA, "agent-1"));
    store.recordNavigation(agentEntry(workspaceB, "agent-2"));

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
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));
    store.recordNavigation(agentEntry(workspaceA, "agent-c"));

    expect(store.navigateBack()).toBe(true);
    expect(store.getSnapshot().cursor).toBe(1);
    expect(store.getSnapshot().replay?.entry.target).toEqual({ kind: "agent", agentId: "agent-b" });
    expect(store.getCanGoForward()).toBe(true);

    expect(store.navigateForward()).toBe(true);
    expect(store.getSnapshot().cursor).toBe(2);
    expect(store.getSnapshot().replay?.entry.target).toEqual({ kind: "agent", agentId: "agent-c" });
    expect(store.getCanGoForward()).toBe(false);
  });

  it("stops at both ends of the history", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));

    expect(store.navigateForward()).toBe(false);
    expect(store.navigateBack()).toBe(true);
    expect(store.navigateBack()).toBe(false);
    expect(store.getSnapshot().cursor).toBe(0);
  });

  it("drops the forward branch after recording past a back jump", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));
    store.recordNavigation(agentEntry(workspaceA, "agent-c"));

    store.navigateBack();
    store.navigateBack();
    // Land on agent-a and let the replay settle before the user navigates again.
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));

    store.recordNavigation(agentEntry(workspaceA, "agent-d"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries.map((item) => item.target)).toEqual([
      { kind: "agent", agentId: "agent-a" },
      { kind: "agent", agentId: "agent-d" },
    ]);
    expect(store.getCanGoForward()).toBe(false);
  });

  it("accepts the replay target without appending an entry", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));

    store.navigateBack();
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.replay).toBeNull();
    expect(snapshot.cursor).toBe(0);
  });

  it("discards observations that do not match an in-flight replay", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));

    store.navigateBack();
    // Intermediate state observed while the jump is still settling.
    store.recordNavigation(agentEntry(workspaceA, "agent-passing"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries.map((item) => item.target)).toEqual([
      { kind: "agent", agentId: "agent-a" },
      { kind: "agent", agentId: "agent-b" },
    ]);
    expect(snapshot.replay).not.toBeNull();
  });

  it("resumes recording after the replay timeout expires", () => {
    const store = createNavigationHistoryStore({ replayTimeoutMs: 500 });
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));

    store.navigateBack();
    vi.advanceTimersByTime(500);

    expect(store.getSnapshot().replay).toBeNull();
    store.recordNavigation(agentEntry(workspaceA, "agent-c"));
    expect(store.getSnapshot().entries.map((item) => item.target)).toEqual([
      { kind: "agent", agentId: "agent-a" },
      { kind: "agent", agentId: "agent-c" },
    ]);
  });

  it("caps the history length", () => {
    const store = createNavigationHistoryStore();

    for (let index = 0; index < 120; index += 1) {
      store.recordNavigation(agentEntry(workspaceA, `agent-${index}`));
    }

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(100);
    expect(snapshot.cursor).toBe(99);
    expect(snapshot.entries[0].target).toEqual({ kind: "agent", agentId: "agent-20" });
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

  it("keeps two tabs on the same agent apart, because the instance is the position", () => {
    const store = createNavigationHistoryStore();

    store.recordNavigation(agentEntry(workspaceA, "agent-1", "tab_1"));
    store.recordNavigation(agentEntry(workspaceA, "agent-1", "tab_2"));

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries.map((item) => item.tabId)).toEqual(["tab_1", "tab_2"]);
    expect(store.getCanGoBack()).toBe(true);
  });

  it("settles a jump onto an agent tab that had to be opened again", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-1", "tab_1"));
    store.recordNavigation(agentEntry(workspaceA, "agent-2", "agent_agent-2"));

    store.navigateBack();
    // The recorded instance is gone, so the jump opened another tab for the agent.
    store.recordNavigation(agentEntry(workspaceA, "agent-1", "tab_9"));

    const snapshot = store.getSnapshot();
    expect(snapshot.replay).toBeNull();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.cursor).toBe(0);
    expect(snapshot.entries[0].tabId).toBe("tab_9");
  });

  it("keeps the recorded instance when the jump finds it again", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-1", "tab_1"));
    store.recordNavigation(agentEntry(workspaceA, "agent-2", "agent_agent-2"));

    store.navigateBack();
    store.recordNavigation(agentEntry(workspaceA, "agent-1", "tab_1"));

    const snapshot = store.getSnapshot();
    expect(snapshot.replay).toBeNull();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.entries[0].tabId).toBe("tab_1");
  });

  it("resets to an empty history", () => {
    const store = createNavigationHistoryStore();
    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    store.navigateBack();

    store.reset();

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toHaveLength(0);
    expect(snapshot.cursor).toBe(-1);
    expect(snapshot.replay).toBeNull();
    expect(store.getCanGoBack()).toBe(false);
  });

  it("records main agent chats and ignores every other position", () => {
    const store = createNavigationHistoryStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.recordNavigation(entry("/settings"));
    store.recordNavigation(entry(workspaceA, { kind: "new_tab" }, "tab_1"));
    store.recordNavigation(entry(workspaceA, { kind: "draft", draftId: "d1" }, "tab_2"));
    store.recordNavigation(entry(workspaceA, { kind: "file", path: "/repo/a.ts" }));
    store.recordNavigation(entry(workspaceA, { kind: "terminal", terminalId: "t1" }));
    store.recordNavigation(
      entry(workspaceA, {
        kind: "provider_subagent",
        parentAgentId: "agent-a",
        subagentId: "s1",
      }),
    );

    expect(store.getSnapshot().entries).toEqual([]);
    expect(store.getCanGoBack()).toBe(false);
    expect(store.getCanGoForward()).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    store.recordNavigation(agentEntry(workspaceA, "agent-a"));

    expect(store.getSnapshot().entries).toHaveLength(1);
  });

  it("notifies subscribers on every snapshot change", () => {
    const store = createNavigationHistoryStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.recordNavigation(agentEntry(workspaceA, "agent-a"));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.recordNavigation(agentEntry(workspaceA, "agent-b"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe("recent agent visits", () => {
    function visitIds(store: ReturnType<typeof createNavigationHistoryStore>): string[] {
      return store.getRecentAgentVisits().map((visit) => visit.agentId);
    }

    function historyTabIds(
      store: ReturnType<typeof createNavigationHistoryStore>,
    ): (string | null)[] {
      return store.getSnapshot().entries.map((item) => item.tabId);
    }

    it("lists visited agents most recent first", () => {
      const store = createNavigationHistoryStore();

      store.recordNavigation(agentEntry(workspaceA, "agent-a"));
      store.recordNavigation(agentEntry(workspaceA, "agent-b"));
      store.recordNavigation(agentEntry(workspaceA, "agent-c"));

      expect(visitIds(store)).toEqual(["agent-c", "agent-b", "agent-a"]);
      expect(store.getRecentAgentVisits()[0]).toEqual({
        serverId: "server-1",
        workspaceId: "workspace-a",
        agentId: "agent-c",
      });
    });

    it("moves a revisited agent to the front instead of adding it twice", () => {
      const store = createNavigationHistoryStore();

      store.recordNavigation(agentEntry(workspaceA, "agent-a"));
      store.recordNavigation(agentEntry(workspaceA, "agent-b"));
      store.recordNavigation(agentEntry(workspaceA, "agent-a"));

      expect(visitIds(store)).toEqual(["agent-a", "agent-b"]);
    });

    it("keeps every agent after walking back and opening somewhere else", () => {
      const store = createNavigationHistoryStore();
      store.recordNavigation(agentEntry(workspaceA, "agent-a"));
      store.recordNavigation(agentEntry(workspaceA, "agent-b"));
      store.recordNavigation(agentEntry(workspaceA, "agent-c"));

      store.navigateBack();
      store.recordNavigation(agentEntry(workspaceA, "agent-b"));
      store.recordNavigation(agentEntry(workspaceA, "agent-d"));

      expect(historyTabIds(store)).toEqual(["agent_agent-a", "agent_agent-b", "agent_agent-d"]);
      expect(visitIds(store)).toEqual(["agent-d", "agent-b", "agent-c", "agent-a"]);
    });

    it("keeps the agents it already has while a jump is in flight", () => {
      const store = createNavigationHistoryStore();
      store.recordNavigation(agentEntry(workspaceA, "agent-a"));
      store.recordNavigation(agentEntry(workspaceA, "agent-b"));

      store.navigateBack();
      // An agent tab the jump merely passed through.
      store.recordNavigation(agentEntry(workspaceA, "agent-passing"));

      expect(visitIds(store)).toEqual(["agent-b", "agent-a"]);
      expect(store.getSnapshot().replay).not.toBeNull();
    });

    it("keeps the same agent id in different workspaces apart", () => {
      const store = createNavigationHistoryStore();

      store.recordNavigation(agentEntry(workspaceA, "agent-a"));
      store.recordNavigation(agentEntry(workspaceB, "agent-a"));

      expect(store.getRecentAgentVisits()).toEqual([
        { serverId: "server-1", workspaceId: "workspace-b", agentId: "agent-a" },
        { serverId: "server-1", workspaceId: "workspace-a", agentId: "agent-a" },
      ]);
    });

    it("caps the list at twenty agents", () => {
      const store = createNavigationHistoryStore();

      for (let index = 0; index < 25; index += 1) {
        store.recordNavigation(agentEntry(workspaceA, `agent-${index}`));
      }

      const visits = store.getRecentAgentVisits();
      expect(visits).toHaveLength(20);
      expect(visits[0].agentId).toBe("agent-24");
      expect(visits[19].agentId).toBe("agent-5");
    });

    it("clears with the history on reset", () => {
      const store = createNavigationHistoryStore();
      store.recordNavigation(agentEntry(workspaceA, "agent-a"));

      store.reset();

      expect(store.getRecentAgentVisits()).toEqual([]);
    });
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
