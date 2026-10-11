/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { theme } = vi.hoisted(() => ({
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

import { SidebarHeaderRow } from "./sidebar-header-row";

function TestIcon({ color }: { size: number; color: string }) {
  return <span data-testid="row-icon" data-color={color} />;
}

interface RenderRowOptions {
  onPress: () => void;
  disabled?: boolean;
  isActive?: boolean;
  trailing?: React.ReactNode;
}

describe("SidebarHeaderRow", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
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

  function renderRow(options: RenderRowOptions): void {
    act(() => {
      root?.render(
        <SidebarHeaderRow
          icon={TestIcon}
          label="History"
          onPress={options.onPress}
          disabled={options.disabled}
          isActive={options.isActive}
          trailing={options.trailing}
          testID="row"
          variant="compact"
        />,
      );
    });
  }

  function pressMainArea(): void {
    act(() => {
      container?.querySelector<HTMLElement>('[data-testid="row"]')?.click();
    });
  }

  function pressTrailingArea(): void {
    act(() => {
      container
        ?.querySelector<HTMLElement>('[data-testid="trailing-slot"]')
        ?.parentElement?.click();
    });
  }

  it("calls onPress once when the enabled row's main area is pressed", () => {
    const onPress = vi.fn();
    renderRow({ onPress });

    pressMainArea();

    expect(onPress).toHaveBeenCalledOnce();
  });

  it("does not call onPress and mutes the icon when disabled", () => {
    const onPress = vi.fn();
    renderRow({ onPress, disabled: true });

    expect(container?.querySelector('[data-testid="row-icon"]')?.getAttribute("data-color")).toBe(
      theme.colors.foregroundExtraMuted,
    );

    pressMainArea();

    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not call onPress when the trailing slot of a disabled row is pressed", () => {
    const onPress = vi.fn();
    renderRow({ onPress, trailing: <span data-testid="trailing-slot" /> });
    pressTrailingArea();

    renderRow({ onPress, disabled: true, trailing: <span data-testid="trailing-slot" /> });
    pressTrailingArea();

    expect(onPress).toHaveBeenCalledOnce();
  });

  it("exposes selected and disabled together when an active row is disabled", () => {
    renderRow({ onPress: vi.fn(), isActive: true, disabled: true });

    const row = container?.querySelector('[data-testid="row"]');
    expect(row?.getAttribute("aria-selected")).toBe("true");
    expect(row?.getAttribute("aria-disabled")).toBe("true");
  });

  it("does not mark a non-disabled row as disabled", () => {
    renderRow({ onPress: vi.fn(), isActive: true });

    const row = container?.querySelector('[data-testid="row"]');
    expect(row?.getAttribute("aria-selected")).toBe("true");
    expect(row?.getAttribute("aria-disabled")).not.toBe("true");
  });
});
