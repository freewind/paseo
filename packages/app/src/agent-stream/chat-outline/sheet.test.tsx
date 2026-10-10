/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, renderHook, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivePromptSource, ChatOutlinePrompt } from "./model";
import { ChatOutlineSheet, useChatOutlineSheetController } from "./sheet";

vi.mock("react-native-unistyles", () => {
  const testTheme = {
    spacing: { 2: 8, 3: 12 },
    borderRadius: { lg: 8 },
    colors: {
      surface2: "#222",
      surface3: "#333",
      foregroundMuted: "#aaa",
      foreground: "#fff",
    },
    fontSize: { sm: 12, base: 14 },
  };
  return {
    StyleSheet: {
      create: (factory: (theme: typeof testTheme) => unknown) => factory(testTheme),
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
