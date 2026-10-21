/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  navigationHistoryStore,
  type NavigationHistoryEntry,
} from "@/stores/navigation-history-store";

import { useRouteBack, type RouteBack } from "./use-route-back";

let routeBack: RouteBack | null = null;

function Probe(): React.ReactElement {
  routeBack = useRouteBack();
  return (
    <span data-testid="history-state">{`${String(routeBack.canGoBack)}|${String(routeBack.canGoForward)}`}</span>
  );
}

const WORKSPACE_PATH = "/h/server-1/workspace/workspace-a";

/** A main agent chat position: the only kind of position the history records. */
function agentEntry(agentId: string): NavigationHistoryEntry {
  return {
    pathname: WORKSPACE_PATH,
    serverId: "server-1",
    workspaceId: "workspace-a",
    target: { kind: "agent", agentId },
    tabId: `agent_${agentId}`,
  };
}

describe("useRouteBack", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    navigationHistoryStore.reset();
    routeBack = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    navigationHistoryStore.reset();
  });

  function renderProbe(): void {
    act(() => {
      root?.render(<Probe />);
    });
  }

  function renderedState(): string {
    return container?.querySelector('[data-testid="history-state"]')?.textContent ?? "";
  }

  function record(agentId: string): void {
    act(() => {
      navigationHistoryStore.recordNavigation(agentEntry(agentId));
    });
  }

  it("reports no navigation while history is empty", () => {
    renderProbe();

    expect(routeBack?.canGoBack).toBe(false);
    expect(routeBack?.canGoForward).toBe(false);
    expect(renderedState()).toBe("false|false");
  });

  it("cannot go back from the first recorded position", () => {
    record("agent-a");
    renderProbe();

    expect(routeBack?.canGoBack).toBe(false);
    expect(renderedState()).toBe("false|false");

    act(() => {
      routeBack?.goBack();
    });
    expect(navigationHistoryStore.getSnapshot().cursor).toBe(0);
  });

  it("moves back and exposes forward once two positions exist", () => {
    record("agent-a");
    record("agent-b");
    renderProbe();
    expect(renderedState()).toBe("true|false");

    act(() => {
      routeBack?.goBack();
    });

    expect(navigationHistoryStore.getSnapshot().cursor).toBe(0);
    expect(renderedState()).toBe("false|true");

    act(() => {
      routeBack?.goForward();
    });

    expect(navigationHistoryStore.getSnapshot().cursor).toBe(1);
    expect(renderedState()).toBe("true|false");
  });

  it("updates reactively when the store changes outside the hook", () => {
    renderProbe();
    expect(renderedState()).toBe("false|false");

    act(() => {
      navigationHistoryStore.recordNavigation(agentEntry("agent-a"));
      navigationHistoryStore.recordNavigation(agentEntry("agent-b"));
    });

    expect(renderedState()).toBe("true|false");
  });
});
