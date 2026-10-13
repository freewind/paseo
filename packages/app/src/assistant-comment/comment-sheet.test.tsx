/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("React", React);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    children,
    footer,
    visible,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    visible: boolean;
  }) =>
    visible ? (
      <>
        {children}
        {footer}
      </>
    ) : null,
}));

import { AssistantCommentSheet, type AssistantCommentRequest } from "./comment-sheet";

afterEach(cleanup);

const request: AssistantCommentRequest = { id: 1, blockText: "some claim" };

function renderSheet(onAttach = vi.fn()) {
  render(<AssistantCommentSheet request={request} onCancel={vi.fn()} onAttach={onAttach} />);
  const input = screen.getByTestId("assistant-comment-input");
  return { input, onAttach };
}

describe("AssistantCommentSheet keyboard submit", () => {
  it("attaches the comment when Enter is pressed with text", () => {
    const { input, onAttach } = renderSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAttach).toHaveBeenCalledExactlyOnceWith("looks right");
  });

  it("keeps the newline when Shift+Enter is pressed", () => {
    const { input, onAttach } = renderSheet();
    fireEvent.change(input, { target: { value: "line one" } });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onAttach).not.toHaveBeenCalled();
  });

  it("ignores Enter during IME composition (isComposing)", () => {
    const { input, onAttach } = renderSheet();
    fireEvent.change(input, { target: { value: "正在输入" } });

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(onAttach).not.toHaveBeenCalled();
  });

  it("ignores Enter with the IME keyCode 229", () => {
    const { input, onAttach } = renderSheet();
    fireEvent.change(input, { target: { value: "正在输入" } });

    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });

    expect(onAttach).not.toHaveBeenCalled();
  });

  it("ignores Enter when the comment is blank", () => {
    const { input, onAttach } = renderSheet();
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAttach).not.toHaveBeenCalled();
  });

  it("ignores non-Enter keys", () => {
    const { input, onAttach } = renderSheet();
    fireEvent.change(input, { target: { value: "abc" } });

    fireEvent.keyDown(input, { key: "a" });

    expect(onAttach).not.toHaveBeenCalled();
  });
});
