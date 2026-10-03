import { describe, expect, it } from "vitest";
import {
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setProjectCollapsed,
  setProjectHidden,
  togglePinnedCollapsed,
  toggleProjectCollapsed,
  toggleProjectHidden,
  toggleWorkspaceGroupCollapsed,
} from "@/stores/sidebar-collapsed-sections-store/state";

function emptyState(): CollapsedProjectsState {
  return {
    collapsedProjectKeys: new Set(),
    collapsedWorkspaceGroupKeys: new Set(),
    collapsedPinned: false,
    hiddenProjectKeys: new Set(),
  };
}

describe("sidebar collapsed projects transitions", () => {
  it("tracks collapsed project keys as a Set", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "project-a", true);
    state = toggleProjectCollapsed(state, "project-b");
    state = toggleProjectCollapsed(state, "project-a");
    state = toggleWorkspaceGroupCollapsed(state, "running");

    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-b"]);
    expect(Array.from(state.collapsedWorkspaceGroupKeys)).toEqual(["running"]);
  });

  it("tracks hidden project keys as a Set", () => {
    let state = emptyState();

    state = setProjectHidden(state, "project-a", true);
    state = toggleProjectHidden(state, "project-b");
    state = toggleProjectHidden(state, "project-a");
    state = setProjectHidden(state, "project-c", false);

    expect(Array.from(state.hiddenProjectKeys)).toEqual(["project-b"]);
  });

  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedWorkspaceGroupKeys: new Set(["running"]),
      collapsedPinned: true,
      hiddenProjectKeys: new Set(["project-c"]),
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedWorkspaceGroupKeys: ["running"],
      collapsedPinned: true,
      hiddenProjectKeys: ["project-c"],
    });
  });

  it("toggles and restores the pinned section collapse flag", () => {
    const toggled = togglePinnedCollapsed(emptyState());
    expect(toggled.collapsedPinned).toBe(true);

    const restored = mergePersistedCollapsedProjects({ collapsedPinned: true }, emptyState());
    expect(restored.collapsedPinned).toBe(true);
  });

  it("restores persisted hidden project keys", () => {
    const restored = mergePersistedCollapsedProjects(
      { hiddenProjectKeys: ["project-a", "project-b"] },
      emptyState(),
    );

    expect(Array.from(restored.hiddenProjectKeys)).toEqual(["project-a", "project-b"]);
  });

  it("rejects the complete value when a persisted project key is invalid", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a", "project-b", 42] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual([]);
    expect(Array.from(restored.collapsedWorkspaceGroupKeys)).toEqual([]);
  });

  it("rejects persisted hidden project keys with invalid entries", () => {
    const restored = mergePersistedCollapsedProjects(
      { hiddenProjectKeys: ["project-a", 42] },
      emptyState(),
    );

    expect(Array.from(restored.hiddenProjectKeys)).toEqual([]);
  });

  it("keeps the existing state object when persisted preferences do not change collapsed keys", () => {
    const currentState = emptyState();

    expect(mergePersistedCollapsedProjects(undefined, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({}, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({ collapsedProjectKeys: [] }, currentState)).toBe(
      currentState,
    );
    expect(mergePersistedCollapsedProjects({ hiddenProjectKeys: [] }, currentState)).toBe(
      currentState,
    );
  });
});
