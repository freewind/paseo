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

import {
  AssistantCommentSheet,
  AssistantMemoSheet,
  type AssistantCommentRequest,
} from "./comment-sheet";

afterEach(cleanup);

const request: AssistantCommentRequest = { id: 1, blockText: "some claim" };

function renderSheet(onAttach = vi.fn(), onSend = vi.fn()) {
  render(
    <AssistantCommentSheet
      request={request}
      onCancel={vi.fn()}
      onAttach={onAttach}
      onSend={onSend}
    />,
  );
  const input = screen.getByTestId("assistant-comment-input");
  return { input, onAttach, onSend };
}

describe("AssistantCommentSheet send now", () => {
  it("sends the comment instead of attaching it", () => {
    const { input, onAttach, onSend } = renderSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.click(screen.getByTestId("assistant-comment-send"));

    expect(onSend).toHaveBeenCalledExactlyOnceWith("looks right");
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("attaches the comment when the attach button is pressed", () => {
    const { input, onAttach, onSend } = renderSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.click(screen.getByTestId("assistant-comment-attach"));

    expect(onAttach).toHaveBeenCalledExactlyOnceWith("looks right");
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe("AssistantMemoSheet", () => {
  function renderMemoSheet(onSubmit = vi.fn(), onCancel = vi.fn()) {
    render(<AssistantMemoSheet request={request} onCancel={onCancel} onSubmit={onSubmit} />);
    return { input: screen.getByTestId("assistant-memo-input"), onSubmit, onCancel };
  }

  it("keeps the quoted text as the initial memo", () => {
    const { onSubmit } = renderMemoSheet();

    fireEvent.click(screen.getByTestId("assistant-memo-submit"));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("some claim");
  });

  it("submits the edited memo trimmed", () => {
    const { input, onSubmit } = renderMemoSheet();
    fireEvent.change(input, { target: { value: "  edited memo  " } });

    fireEvent.click(screen.getByTestId("assistant-memo-submit"));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("edited memo");
  });

  it("submits on Enter", () => {
    const { input, onSubmit } = renderMemoSheet();

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("some claim");
  });

  it("does not submit a blank memo", () => {
    const { input, onSubmit } = renderMemoSheet();
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes without submitting when cancelled", () => {
    const { onCancel, onSubmit } = renderMemoSheet();

    fireEvent.click(screen.getByTestId("assistant-memo-cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

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
