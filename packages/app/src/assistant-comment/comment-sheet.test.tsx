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

import { AssistantAnnotationSheet, type AssistantCommentRequest } from "./comment-sheet";

afterEach(cleanup);

const request: AssistantCommentRequest = { id: 1, blockText: "some claim" };

function renderCommentSheet(onSubmit = vi.fn(), onSendNow = vi.fn()) {
  render(
    <AssistantAnnotationSheet
      variant="comment"
      request={request}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
      onSendNow={onSendNow}
    />,
  );
  const input = screen.getByTestId("assistant-comment-input");
  return { input, onSubmit, onSendNow };
}

function renderMemoSheet(onSubmit = vi.fn(), onCancel = vi.fn()) {
  render(
    <AssistantAnnotationSheet
      variant="memo"
      request={request}
      onCancel={onCancel}
      onSubmit={onSubmit}
    />,
  );
  const input = screen.getByTestId("assistant-memo-input");
  return { input, onSubmit, onCancel };
}

describe("AssistantAnnotationSheet comment", () => {
  it("sends the comment instead of attaching it", () => {
    const { input, onSubmit, onSendNow } = renderCommentSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.click(screen.getByTestId("assistant-comment-send"));

    expect(onSendNow).toHaveBeenCalledExactlyOnceWith("looks right");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("attaches the comment when the attach button is pressed", () => {
    const { input, onSubmit, onSendNow } = renderCommentSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.click(screen.getByTestId("assistant-comment-attach"));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("looks right");
    expect(onSendNow).not.toHaveBeenCalled();
  });

  it("shows the quoted block", () => {
    renderCommentSheet();

    expect(screen.getByText("some claim")).toBeTruthy();
  });
});

describe("AssistantAnnotationSheet comment keyboard", () => {
  function pressKey(init: Record<string, unknown>, value = "looks right") {
    const { input, onSubmit } = renderCommentSheet();
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, init);
    return onSubmit;
  }

  it("attaches the comment when Enter is pressed with text", () => {
    expect(pressKey({ key: "Enter" })).toHaveBeenCalledExactlyOnceWith("looks right");
  });

  it("keeps the newline when Shift+Enter is pressed", () => {
    expect(pressKey({ key: "Enter", shiftKey: true })).not.toHaveBeenCalled();
  });

  it("ignores Enter during IME composition (isComposing)", () => {
    expect(pressKey({ key: "Enter", isComposing: true }, "正在输入")).not.toHaveBeenCalled();
  });

  it("ignores Enter with the IME keyCode 229", () => {
    expect(pressKey({ key: "Enter", keyCode: 229 }, "正在输入")).not.toHaveBeenCalled();
  });

  it("ignores Enter when the comment is blank", () => {
    expect(pressKey({ key: "Enter" }, "   ")).not.toHaveBeenCalled();
  });

  it("ignores non-Enter keys", () => {
    expect(pressKey({ key: "a" })).not.toHaveBeenCalled();
  });

  it("sends the comment straight away on Cmd+Enter", () => {
    const { input, onSubmit, onSendNow } = renderCommentSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    expect(onSendNow).toHaveBeenCalledExactlyOnceWith("looks right");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends the comment straight away on Ctrl+Enter", () => {
    const { input, onSubmit, onSendNow } = renderCommentSheet();
    fireEvent.change(input, { target: { value: "looks right" } });

    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });

    expect(onSendNow).toHaveBeenCalledExactlyOnceWith("looks right");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("AssistantAnnotationSheet memo", () => {
  it("shows the quoted block in the same place the comment sheet does", () => {
    renderMemoSheet();

    expect(screen.getByText("some claim")).toBeTruthy();
    expect(screen.getByTestId("assistant-memo-input")).toBeTruthy();
  });

  it("submits an empty comment so the quote alone can be saved", () => {
    const { onSubmit } = renderMemoSheet();

    fireEvent.click(screen.getByTestId("assistant-memo-submit"));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("");
  });

  it("submits the typed comment trimmed", () => {
    const { input, onSubmit } = renderMemoSheet();
    fireEvent.change(input, { target: { value: "  edited memo  " } });

    fireEvent.click(screen.getByTestId("assistant-memo-submit"));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("edited memo");
  });

  it("submits on Enter", () => {
    const { input, onSubmit } = renderMemoSheet();
    fireEvent.change(input, { target: { value: "keep this" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("keep this");
  });

  it("treats Cmd+Enter as plain Enter, since a memo has nowhere to send to", () => {
    const { input, onSubmit } = renderMemoSheet();
    fireEvent.change(input, { target: { value: "keep this" } });

    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("keep this");
  });

  it("closes without submitting when cancelled", () => {
    const { onCancel, onSubmit } = renderMemoSheet();

    fireEvent.click(screen.getByTestId("assistant-memo-cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
