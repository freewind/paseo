/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routeBack, theme } = vi.hoisted(() => ({
  routeBack: { canGoBack: false, goBack: vi.fn() },
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
  useRouteBack: () => ({ canGoBack: routeBack.canGoBack, goBack: routeBack.goBack }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "common.actions.back" ? "Back" : key),
  }),
}));

vi.mock("lucide-react-native", () => ({
  ArrowLeft: () => React.createElement("span", { "data-icon": "ArrowLeft" }),
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
    routeBack.canGoBack = false;
    routeBack.goBack.mockReset();
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

  function renderBackRow(onBeforeNavigate?: () => void): void {
    act(() => {
      root?.render(<SidebarBackRow onBeforeNavigate={onBeforeNavigate} />);
    });
  }

  function pressRow(): void {
    act(() => {
      container?.querySelector<HTMLElement>('[data-testid="sidebar-back"]')?.click();
    });
  }

  it("navigates back after closing the sidebar when history exists", () => {
    routeBack.canGoBack = true;
    const onBeforeNavigate = vi.fn();
    renderBackRow(onBeforeNavigate);

    pressRow();

    expect(onBeforeNavigate).toHaveBeenCalledOnce();
    expect(routeBack.goBack).toHaveBeenCalledOnce();
    expect(onBeforeNavigate.mock.invocationCallOrder[0]).toBeLessThan(
      routeBack.goBack.mock.invocationCallOrder[0],
    );
  });

  it("keeps rendering the row and disables it when there is no history", () => {
    routeBack.canGoBack = false;
    renderBackRow();

    const row = container?.querySelector('[data-testid="sidebar-back"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute("aria-disabled")).toBe("true");
  });

  it("does nothing when pressed without history", () => {
    routeBack.canGoBack = false;
    const onBeforeNavigate = vi.fn();
    renderBackRow(onBeforeNavigate);

    pressRow();

    expect(routeBack.goBack).not.toHaveBeenCalled();
    expect(onBeforeNavigate).not.toHaveBeenCalled();
  });
});
