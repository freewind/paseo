/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigationRef, router, emitEvent, resetSubscriptions, unsubscribeSpy } = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  const unsubscribeSpyMock = vi.fn();

  function emit(event: string): void {
    const callbacks = listeners.get(event);
    if (!callbacks) {
      return;
    }
    for (const callback of callbacks) {
      callback();
    }
  }

  function clearSubscriptions(): void {
    listeners.clear();
    unsubscribeSpyMock.mockReset();
  }

  const ref = {
    isReady: vi.fn(() => false),
    canGoBack: vi.fn(() => false),
    addListener: vi.fn((event: string, callback: () => void) => {
      const callbacks = listeners.get(event) ?? new Set<() => void>();
      callbacks.add(callback);
      listeners.set(event, callbacks);
      return () => {
        callbacks.delete(callback);
        unsubscribeSpyMock(event);
      };
    }),
  };

  const routerMock = {
    back: vi.fn(),
    replace: vi.fn(),
  };

  return {
    navigationRef: ref,
    router: routerMock,
    emitEvent: emit,
    resetSubscriptions: clearSubscriptions,
    unsubscribeSpy: unsubscribeSpyMock,
  };
});

vi.mock("expo-router", () => ({
  useNavigationContainerRef: () => navigationRef,
  router,
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { useRouteBack, type RouteBack } from "./use-route-back";

let routeBack: RouteBack | null = null;

function Probe(): React.ReactElement {
  routeBack = useRouteBack();
  return <span data-testid="can-go-back">{String(routeBack.canGoBack)}</span>;
}

describe("useRouteBack", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    resetSubscriptions();
    navigationRef.isReady.mockReset();
    navigationRef.isReady.mockReturnValue(false);
    navigationRef.canGoBack.mockReset();
    navigationRef.canGoBack.mockReturnValue(false);
    navigationRef.addListener.mockClear();
    router.back.mockReset();
    router.replace.mockReset();
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
  });

  function renderProbe(): void {
    act(() => {
      root?.render(<Probe />);
    });
  }

  function renderedCanGoBack(): string {
    return container?.querySelector('[data-testid="can-go-back"]')?.textContent ?? "";
  }

  it("reports no back and does not navigate while the container is not ready", () => {
    renderProbe();

    expect(routeBack?.canGoBack).toBe(false);

    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).not.toHaveBeenCalled();
  });

  it("reports no back and does not navigate when there is no history", () => {
    navigationRef.isReady.mockReturnValue(true);

    renderProbe();
    expect(routeBack?.canGoBack).toBe(false);

    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("reports back and goes back once when history exists", () => {
    navigationRef.isReady.mockReturnValue(true);
    navigationRef.canGoBack.mockReturnValue(true);

    renderProbe();
    expect(routeBack?.canGoBack).toBe(true);

    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("updates canGoBack from the state event without a manual re-render", () => {
    navigationRef.isReady.mockReturnValue(true);

    renderProbe();
    expect(renderedCanGoBack()).toBe("false");

    navigationRef.canGoBack.mockReturnValue(true);
    act(() => {
      emitEvent("state");
    });
    expect(renderedCanGoBack()).toBe("true");

    navigationRef.canGoBack.mockReturnValue(false);
    act(() => {
      emitEvent("state");
    });
    expect(renderedCanGoBack()).toBe("false");
  });

  it("does not go back when history disappears before the click", () => {
    navigationRef.isReady.mockReturnValue(true);
    navigationRef.canGoBack.mockReturnValue(true);

    renderProbe();
    expect(routeBack?.canGoBack).toBe(true);

    navigationRef.canGoBack.mockReturnValue(false);
    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).not.toHaveBeenCalled();
  });

  it("unsubscribes from both events on unmount", () => {
    navigationRef.isReady.mockReturnValue(true);

    renderProbe();
    act(() => {
      root?.unmount();
    });
    root = null;

    expect(unsubscribeSpy).toHaveBeenCalledWith("state");
    expect(unsubscribeSpy).toHaveBeenCalledWith("ready");
  });
});
