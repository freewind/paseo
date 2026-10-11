/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 2: 8 },
    fontSize: { sm: 13 },
    colors: {
      foreground: "#foreground",
      foregroundMuted: "#muted",
      foregroundExtraMuted: "#extra-muted",
      statusDotRunning: "#running",
    },
  },
}));

vi.mock("react-native", () => ({
  View: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement("div", props, children),
  Pressable: ({ children, onPress, accessibilityRole, ...props }: Record<string, unknown>) =>
    React.createElement(
      "div",
      { ...props, role: accessibilityRole, onClick: onPress as () => void },
      children as React.ReactNode,
    ),
  Text: ({ children, style }: React.PropsWithChildren<{ style?: Record<string, unknown>[] }>) => {
    const resolvedStyle = Object.assign({}, ...(style ?? []).filter(Boolean));
    return React.createElement(
      "span",
      {
        "data-color": resolvedStyle.color,
        "data-decoration": resolvedStyle.textDecorationLine,
      },
      children,
    );
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (value: typeof theme) => unknown) => factory(theme),
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({ uniProps, ...props }: Record<string, unknown>) => {
      const themedProps = (uniProps as (value: typeof theme) => Record<string, unknown>)(theme);
      return React.createElement(Component, { ...props, ...themedProps });
    },
}));

vi.mock("lucide-react-native", () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": name });
  return {
    Circle: createIcon("Circle"),
    CircleCheck: createIcon("CircleCheck"),
    CircleDot: createIcon("CircleDot"),
    ChevronDown: createIcon("ChevronDown"),
    ChevronRight: createIcon("ChevronRight"),
  };
});

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { TaskListRow } from "./task-list-row";

const pendingTask = { text: "Queued", completed: false } as const;
const runningTask = {
  text: "Run checks",
  activeForm: "Running checks",
  completed: false,
  status: "in_progress",
} as const;
const completedTask = { text: "Finished", completed: true, status: "completed" } as const;
const describedTask = {
  text: "test",
  completed: false,
  status: "pending",
  description: "a long body",
} as const;

describe("TaskListRow", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps a pending task's ring quieter than its label, so it does not read as a checkbox", () => {
    act(() => root.render(<TaskListRow task={pendingTask} />));

    expect(container.querySelector('[data-icon="Circle"]')?.getAttribute("color")).toBe(
      "#extra-muted",
    );
    expect(container.querySelector("[data-color]")?.getAttribute("data-color")).toBe("#muted");
  });

  it("foregrounds only the running task with the running blue circle dot", () => {
    act(() => root.render(<TaskListRow task={runningTask} />));

    expect(container.textContent).toBe("Running checks");
    expect(container.querySelector('[data-icon="CircleDot"]')?.getAttribute("color")).toBe(
      "#running",
    );
    expect(container.querySelector("[data-color]")?.getAttribute("data-color")).toBe("#foreground");
  });

  it("extra-mutes completed tasks with a circle check", () => {
    act(() => root.render(<TaskListRow task={completedTask} />));

    expect(container.querySelector('[data-icon="CircleCheck"]')?.getAttribute("color")).toBe(
      "#extra-muted",
    );
    const text = container.querySelector("[data-color]");
    expect(text?.getAttribute("data-color")).toBe("#extra-muted");
    expect(text?.getAttribute("data-decoration")).toBe("line-through");
  });

  it("hides the body and shows a collapsed chevron until the row is pressed", () => {
    act(() => root.render(<TaskListRow task={describedTask} />));

    expect(container.textContent).toBe("test");
    expect(container.querySelector('[data-icon="ChevronRight"]')).not.toBeNull();

    act(() => {
      container
        .querySelector("div[role=button]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toBe("testa long body");
    expect(container.querySelector('[data-icon="ChevronDown"]')).not.toBeNull();
  });
});
