/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface RootNavigationState {
  key?: string;
}

const { navigationState, router } = vi.hoisted(() => ({
  navigationState: { current: undefined as RootNavigationState | undefined },
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock("expo-router", () => ({
  useRootNavigationState: () => navigationState.current,
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
    navigationState.current = undefined;
    router.back.mockReset();
    router.canGoBack.mockReset();
    router.replace.mockReset();
    router.canGoBack.mockReturnValue(false);
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

  it("reports no back while the navigation container is not ready", () => {
    navigationState.current = undefined;

    renderProbe();

    expect(routeBack?.canGoBack).toBe(false);
    expect(renderedCanGoBack()).toBe("false");
  });

  it("reports no back and does not navigate when there is no history", () => {
    navigationState.current = { key: "root" };
    router.canGoBack.mockReturnValue(false);

    renderProbe();
    expect(routeBack?.canGoBack).toBe(false);

    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("reports back and goes back once when history exists", () => {
    navigationState.current = { key: "root" };
    router.canGoBack.mockReturnValue(true);

    renderProbe();
    expect(routeBack?.canGoBack).toBe(true);

    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("updates canGoBack when the root navigation state changes", () => {
    router.canGoBack.mockReturnValue(true);
    navigationState.current = undefined;

    renderProbe();
    expect(routeBack?.canGoBack).toBe(false);

    navigationState.current = { key: "root" };
    renderProbe();
    expect(routeBack?.canGoBack).toBe(true);

    navigationState.current = undefined;
    renderProbe();
    expect(routeBack?.canGoBack).toBe(false);
  });

  it("does not go back when history disappears before the click", () => {
    navigationState.current = { key: "root" };
    router.canGoBack.mockReturnValue(true);

    renderProbe();
    expect(routeBack?.canGoBack).toBe(true);

    router.canGoBack.mockReturnValue(false);
    act(() => {
      routeBack?.goBack();
    });

    expect(router.back).not.toHaveBeenCalled();
  });
});
