/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Pressable } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setStringAsyncMock, parentPressMock, getText } = vi.hoisted(() => ({
  setStringAsyncMock: vi.fn(() => Promise.resolve()),
  parentPressMock: vi.fn(),
  getText: vi.fn(() => "Input:\npath: /repo/app.ts"),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: setStringAsyncMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolCallDetails.copy": "Copy",
        "toolCallDetails.copied": "Copied",
      })[key] ?? key,
  }),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { CopyTextButton } from "./copy-text-button";

describe("CopyTextButton", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    setStringAsyncMock.mockClear();
    parentPressMock.mockClear();
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
    vi.useRealTimers();
  });

  function renderInsidePressable() {
    act(() => {
      root?.render(
        <Pressable onPress={parentPressMock}>
          <CopyTextButton getText={getText} />
        </Pressable>,
      );
    });
    return container as HTMLElement;
  }

  it("copies the serialized tool call and confirms without toggling its parent", async () => {
    const element = renderInsidePressable();

    await act(async () => {
      element.querySelector<HTMLElement>('[aria-label="Copy"]')?.click();
    });

    expect(setStringAsyncMock).toHaveBeenCalledWith("Input:\npath: /repo/app.ts");
    expect(parentPressMock).not.toHaveBeenCalled();
    expect(element.querySelector('[aria-label="Copied"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(element.querySelector('[aria-label="Copy"]')).not.toBeNull();
  });
});
