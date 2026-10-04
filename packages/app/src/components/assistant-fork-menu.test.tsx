/**
 * @vitest-environment jsdom
 */
import { i18n as testI18n } from "@/i18n/i18next";
import React from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { AssistantForkMenu, type AssistantForkChoice } from "@/components/assistant-fork-menu";

void testI18n;

const { theme, clickHandlersMock } = vi.hoisted(() => {
  const hoistedTheme = {
    spacing: Array.from({ length: 30 }, (_, index) => index * 4),
    borderWidth: { 1: 1 },
    borderRadius: { sm: 4, md: 6 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { normal: "400", medium: "500" },
    opacity: { 50: 0.5 },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface2: "#222",
      borderAccent: "#444",
    },
  };
  const clickHandlers = new Map<string, () => Promise<void>>();
  return { theme: hoistedTheme, clickHandlersMock: clickHandlers };
});

vi.hoisted(async () => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  // vi.mock factories are hoisted above the imports, so the JSX inside them has
  // no React binding in scope yet. Publish it for the classic transform.
  (globalThis as unknown as { React: unknown }).React = await vi.importActual("react");
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...rest
    }: {
      uniProps?: (theme: unknown) => Record<string, unknown>;
    } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.mock("@/constants/platform", () => ({ isNative: false, isWeb: true }));

// The menu renders react-native primitives; jsdom needs host elements instead.
vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (spec: Record<string, unknown>) => spec.web ?? spec.default },
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// The icon package ships syntax this vitest environment cannot parse, and the
// menu renders no icon detail the assertions below depend on.
vi.mock("lucide-react-native", () => ({ Split: () => <span /> }));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children, testID }: { children: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div role="presentation">{children}</div>
  ),
  DropdownMenuSeparator: () => <div role="separator" />,
  DropdownMenuItem: ({
    children,
    onSelect,
    testID,
  }: {
    children: React.ReactNode;
    onSelect?: () => Promise<void>;
    testID?: string;
  }) => {
    if (testID && onSelect) {
      clickHandlersMock.set(testID, onSelect);
    }
    return (
      <button type="button" data-testid={testID}>
        {children}
      </button>
    );
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

async function renderMenu(supportsSessionFork: boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onFork = vi.fn<(choice: AssistantForkChoice) => Promise<void>>(async () => undefined);
  await act(async () => {
    root.render(<AssistantForkMenu onFork={onFork} supportsSessionFork={supportsSessionFork} />);
  });
  return { container, onFork };
}

describe("AssistantForkMenu", () => {
  beforeEach(() => {
    clickHandlersMock.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides the session fork group on a host that cannot branch sessions", async () => {
    const { container } = await renderMenu(false);

    expect(container.querySelector('[data-testid="assistant-fork-menu-session-tab"]')).toBeNull();
    expect(container.querySelector('[data-testid="assistant-fork-menu-new-tab"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-fork-menu-new-workspace"]'),
    ).not.toBeNull();
  });

  it("offers both session fork destinations when the host supports them", async () => {
    const { container } = await renderMenu(true);

    expect(
      container.querySelector('[data-testid="assistant-fork-menu-session-tab"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="assistant-fork-menu-session-workspace"]'),
    ).not.toBeNull();
  });

  it("reports the mode and destination the user actually picked", async () => {
    const { onFork } = await renderMenu(true);

    await act(async () => {
      await clickHandlersMock.get("assistant-fork-menu-session-workspace")?.();
    });
    expect(onFork).toHaveBeenLastCalledWith({ mode: "session", target: "workspace" });

    await act(async () => {
      await clickHandlersMock.get("assistant-fork-menu-new-tab")?.();
    });
    expect(onFork).toHaveBeenLastCalledWith({ mode: "context", target: "tab" });
  });
});
