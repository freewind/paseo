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

function entry(pathname: string): NavigationHistoryEntry {
  const isWorkspace = pathname.startsWith("/h/server-1/workspace/");
  return {
    pathname,
    serverId: isWorkspace ? "server-1" : null,
    workspaceId: isWorkspace ? (pathname.split("/")[4] ?? null) : null,
    target: null,
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

  function record(pathname: string): void {
    act(() => {
      navigationHistoryStore.recordNavigation(entry(pathname));
    });
  }

  it("reports no navigation while history is empty", () => {
    renderProbe();

    expect(routeBack?.canGoBack).toBe(false);
    expect(routeBack?.canGoForward).toBe(false);
    expect(renderedState()).toBe("false|false");
  });

  it("cannot go back from the first recorded position", () => {
    record("/a");
    renderProbe();

    expect(routeBack?.canGoBack).toBe(false);
    expect(renderedState()).toBe("false|false");

    act(() => {
      routeBack?.goBack();
    });
    expect(navigationHistoryStore.getSnapshot().cursor).toBe(0);
  });

  it("moves back and exposes forward once two positions exist", () => {
    record("/a");
    record("/b");
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
      navigationHistoryStore.recordNavigation(entry("/a"));
      navigationHistoryStore.recordNavigation(entry("/b"));
    });

    expect(renderedState()).toBe("true|false");
  });
});
