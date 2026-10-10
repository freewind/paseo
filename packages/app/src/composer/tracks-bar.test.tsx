/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerTrackBar, ComposerTrackTools } from "./tracks";

vi.mock("react-native-unistyles", () => {
  const scale = new Proxy({}, { get: () => 8 });
  const mockTheme = new Proxy(
    {
      spacing: scale,
      borderRadius: scale,
      borderWidth: scale,
      colors: new Proxy({}, { get: () => "#fff" }),
      contentMaxWidth: 720,
    },
    { get: (target, key) => Reflect.get(target, key) ?? 8 },
  );
  return {
    StyleSheet: {
      create: (factory: (theme: typeof mockTheme) => unknown) => factory(mockTheme),
    },
  };
});

vi.mock("@/components/ui/menu", () => ({
  MenuRoot: ({ children }: { children: React.ReactNode }) => children,
  MenuSeparator: () => null,
  MenuSurface: () => null,
  MenuTrigger: () => null,
  useMenuContext: () => ({ open: false, selectItem: vi.fn() }),
}));
vi.mock("@/components/status-ring", () => ({ StatusRing: () => null }));
vi.mock("@/utils/status-dot-color", () => ({ getStatusDotColor: () => "#fff" }));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => cleanup());

describe("ComposerTrackBar", () => {
  it("keeps tools in a separate right-side slot when no status pills exist", () => {
    render(
      <ComposerTrackBar>
        <ComposerTrackTools>
          <span data-testid="outline-tool">Chat outline</span>
        </ComposerTrackTools>
      </ComposerTrackBar>,
    );

    expect(screen.getByTestId("composer-track-actions").textContent).toBe("Chat outline");
    expect(screen.getByTestId("composer-track-content").textContent).toBe("");
  });

  it("keeps status pills and tools in separate slots", () => {
    render(
      <ComposerTrackBar>
        <span data-testid="status-pill">3 tasks</span>
        <ComposerTrackTools>
          <span data-testid="outline-tool">Chat outline</span>
        </ComposerTrackTools>
      </ComposerTrackBar>,
    );

    expect(screen.getByTestId("composer-track-content").textContent).toBe("3 tasks");
    expect(screen.getByTestId("composer-track-actions").textContent).toBe("Chat outline");
  });
});
