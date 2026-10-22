/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, renderHook, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivePromptSource, ChatOutlinePrompt } from "./model";
import { ChatOutlineSheet, useChatOutlineSheetController } from "./sheet";

vi.mock("react-native-unistyles", () => {
  const testTheme = {
    spacing: { 0: 0, 0.5: 2, 1: 4, 2: 8, 3: 12, 4: 16 },
    borderRadius: { sm: 4, md: 6, lg: 8, full: 999 },
    borderWidth: { 1: 1, 2: 2 },
    colors: {
      surface2: "#222",
      surface3: "#333",
      foregroundMuted: "#aaa",
      foreground: "#fff",
      border: "#444",
      borderAccent: "#555",
      accent: "#08f",
      accentForeground: "#fff",
      interactionHighlight: "#2a2a2a",
    },
    fontSize: { xs: 11, sm: 12, base: 14, lg: 16 },
    fontWeight: { normal: "400", medium: "500", semibold: "600", bold: "700" },
    iconSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 },
    opacity: { 50: 0.5 },
  };
  return {
    StyleSheet: {
      create: (factory: (theme: typeof testTheme) => unknown) => factory(testTheme),
    },
    // The shared button kit themes its icons; the sheet tests only care about what renders.
    withUnistyles:
      (Component: React.ComponentType<Record<string, unknown>>) =>
      (props: Record<string, unknown>) =>
        React.createElement(Component, props),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The detail content only copies to the clipboard through the toast api; loading the real toaster
// drags its whole style sheet into this test's minimal theme.
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ copied: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? children : null,
}));

const prompts: ChatOutlinePrompt[] = [
  { seq: 2, timestamp: new Date(2).toISOString(), preview: "First question" },
  { seq: 6, timestamp: new Date(6).toISOString(), preview: "Second question" },
];

const activePrompt: ActivePromptSource = {
  subscribe: () => () => undefined,
  getActiveSeq: () => 6,
};

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => cleanup());

describe("ChatOutlineSheet", () => {
  it("marks the current prompt and closes after jumping to a selected prompt", () => {
    const onClose = vi.fn();
    const onJumpToPrompt = vi.fn();

    render(
      <ChatOutlineSheet
        prompts={prompts}
        activePrompt={activePrompt}
        visible
        onClose={onClose}
        onJumpToPrompt={onJumpToPrompt}
      />,
    );

    expect(screen.getByRole("tab", { selected: true }).getAttribute("data-testid")).toBe(
      "chat-outline-prompt-6",
    );
    fireEvent.click(screen.getByTestId("chat-outline-prompt-2"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onJumpToPrompt).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("closes the open sheet when the active conversation changes", () => {
    const { result, rerender } = renderHook(
      ({ agentId }: { agentId: string }) =>
        useChatOutlineSheetController({
          isCompact: true,
          isActive: true,
          enabled: true,
          agentId,
          timelineEpoch: "epoch-1",
          promptCount: 2,
        }),
      { initialProps: { agentId: "agent-1" } },
    );

    act(() => result.current.open());
    expect(result.current.visible).toBe(true);

    rerender({ agentId: "agent-2" });
    expect(result.current.visible).toBe(false);
  });

  it("does not render a directory for fewer than two prompts", () => {
    render(
      <ChatOutlineSheet
        prompts={[prompts[0]!]}
        activePrompt={activePrompt}
        visible
        onClose={vi.fn()}
        onJumpToPrompt={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("chat-outline-prompt-2")).toBeNull();
  });
});
