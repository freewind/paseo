/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { history, theme } = vi.hoisted(() => ({
  history: {
    canGoBack: false,
    canGoForward: false,
    goBack: vi.fn(),
    goForward: vi.fn(),
  },
  theme: {
    spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16 },
    iconSize: { sm: 14, md: 18 },
    borderWidth: { 1: 1 },
    borderRadius: { sm: 4, md: 6, lg: 8, xl: 12, "2xl": 16, full: 999 },
    fontSize: { xs: 11, sm: 13, base: 15 },
    fontWeight: { normal: "400", medium: "500", semibold: "600" },
    opacity: { 50: 0.5 },
    shadow: { md: {} },
    colors: {
      surfaceSidebar: "#111111",
      surfaceSidebarHover: "#222222",
      surface0: "#000000",
      surface1: "#111111",
      surface2: "#222222",
      surface3: "#333333",
      foreground: "#ffffff",
      foregroundMuted: "#aaaaaa",
      foregroundExtraMuted: "#a1a1aa",
      border: "#555555",
      borderAccent: "#666666",
      accent: "#0a84ff",
      accentForeground: "#ffffff",
      destructive: "#ff4444",
      primary: "#0a84ff",
      palette: { white: "#ffffff" },
    },
  },
}));

vi.mock("@/hooks/use-route-back", () => ({
  useRouteBack: () => history,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common.actions.back") return "Back";
      if (key === "common.actions.forward") return "Forward";
      return key;
    },
  }),
}));

vi.mock("lucide-react-native", () => ({
  ArrowLeft: () => React.createElement("span", { "data-icon": "ArrowLeft" }),
  ArrowRight: () => React.createElement("span", { "data-icon": "ArrowRight" }),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function" ? (factory as (t: typeof theme) => unknown)(theme) : factory,
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...rest
    }: { uniProps?: (t: typeof theme) => Record<string, unknown> } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { SidebarBackRow } from "./sidebar-back-row";

describe("SidebarBackRow", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    history.canGoBack = false;
    history.canGoForward = false;
    history.goBack.mockReset();
    history.goForward.mockReset();
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

  function renderRows(onBeforeNavigate?: () => void): void {
    act(() => {
      root?.render(<SidebarBackRow onBeforeNavigate={onBeforeNavigate} />);
    });
  }

  function press(testID: string): void {
    act(() => {
      container?.querySelector<HTMLElement>(`[data-testid="${testID}"]`)?.click();
    });
  }

  function row(testID: string): HTMLElement | null {
    return container?.querySelector<HTMLElement>(`[data-testid="${testID}"]`) ?? null;
  }

  it("navigates back after closing the sidebar when history exists", () => {
    history.canGoBack = true;
    const onBeforeNavigate = vi.fn();
    renderRows(onBeforeNavigate);

    press("sidebar-back");

    expect(onBeforeNavigate).toHaveBeenCalledOnce();
    expect(history.goBack).toHaveBeenCalledOnce();
    expect(onBeforeNavigate.mock.invocationCallOrder[0]).toBeLessThan(
      history.goBack.mock.invocationCallOrder[0],
    );
  });

  it("navigates forward after closing the sidebar when a forward branch exists", () => {
    history.canGoForward = true;
    const onBeforeNavigate = vi.fn();
    renderRows(onBeforeNavigate);

    press("sidebar-forward");

    expect(onBeforeNavigate).toHaveBeenCalledOnce();
    expect(history.goForward).toHaveBeenCalledOnce();
    expect(history.goBack).not.toHaveBeenCalled();
  });

  it("keeps both rows rendered and disables them when there is no history", () => {
    renderRows();

    const backRow = row("sidebar-back");
    const forwardRow = row("sidebar-forward");
    expect(backRow).not.toBeNull();
    expect(backRow?.getAttribute("aria-disabled")).toBe("true");
    expect(forwardRow).not.toBeNull();
    expect(forwardRow?.getAttribute("aria-disabled")).toBe("true");
  });

  it("disables only the direction without history", () => {
    history.canGoBack = true;
    renderRows();

    expect(row("sidebar-back")?.getAttribute("aria-disabled")).not.toBe("true");
    expect(row("sidebar-forward")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("does nothing when pressed without history", () => {
    const onBeforeNavigate = vi.fn();
    renderRows(onBeforeNavigate);

    press("sidebar-back");
    press("sidebar-forward");

    expect(history.goBack).not.toHaveBeenCalled();
    expect(history.goForward).not.toHaveBeenCalled();
    expect(onBeforeNavigate).not.toHaveBeenCalled();
  });
});
