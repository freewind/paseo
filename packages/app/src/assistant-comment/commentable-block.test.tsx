/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { controllerRef, selectionRef, readSelection } = vi.hoisted(() => ({
  controllerRef: {
    current: null as null | { requestComment: (blockText: string) => void },
  },
  selectionRef: { current: null as string | null },
  readSelection: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/assistant-comment/context", () => ({
  useAssistantComment: () => controllerRef.current,
}));

vi.mock("@/assistant-comment/selection", () => ({
  readAssistantCommentSelection: () => {
    readSelection();
    return selectionRef.current;
  },
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({
    children,
    onLongPress,
    onContextMenu,
  }: {
    children: React.ReactNode;
    onLongPress?: () => void;
    onContextMenu?: () => void;
  }) => (
    <div data-testid="comment-trigger" onContextMenu={onContextMenu}>
      <button type="button" data-testid="comment-long-press" onClick={onLongPress} />
      {children}
    </div>
  ),
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" data-testid="comment-item" onClick={onSelect}>
      {children}
    </button>
  ),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { MarkdownCommentableBlock } from "./commentable-block";

describe("MarkdownCommentableBlock", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    controllerRef.current = null;
    selectionRef.current = null;
    readSelection.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(blockText: string) {
    act(() =>
      root.render(
        <MarkdownCommentableBlock blockText={blockText}>
          <span>body text</span>
        </MarkdownCommentableBlock>,
      ),
    );
  }

  function openMenuByLongPress(): void {
    const press = container.querySelector<HTMLButtonElement>("[data-testid=comment-long-press]");
    expect(press).not.toBeNull();
    act(() => press?.click());
  }

  function openMenuByRightClick(): void {
    const trigger = container.querySelector<HTMLElement>("[data-testid=comment-trigger]");
    expect(trigger).not.toBeNull();
    act(() => {
      trigger?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
  }

  function chooseCommentItem(): void {
    const item = container.querySelector<HTMLButtonElement>("[data-testid=comment-item]");
    expect(item).not.toBeNull();
    act(() => item?.click());
  }

  it("renders the block without a trigger outside a chat surface", () => {
    render("some claim");
    expect(container.textContent).toBe("body text");
    expect(container.querySelector("[data-testid=comment-trigger]")).toBeNull();
  });

  it("skips the trigger for a block with no text", () => {
    controllerRef.current = { requestComment: vi.fn() };
    render("   ");
    expect(container.querySelector("[data-testid=comment-trigger]")).toBeNull();
  });

  it("hands the block text to the controller when the comment item is chosen", () => {
    const requestComment = vi.fn();
    controllerRef.current = { requestComment };
    render("some claim");
    const item = container.querySelector<HTMLButtonElement>("[data-testid=comment-item]");
    expect(item).not.toBeNull();
    act(() => item?.click());
    expect(requestComment).toHaveBeenCalledWith("some claim");
  });

  it("hands the selected text to the controller when a selection exists", () => {
    const requestComment = vi.fn();
    controllerRef.current = { requestComment };
    selectionRef.current = "the **selected** words";
    render("some claim");

    openMenuByLongPress();

    expect(readSelection).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("comment.menu.itemSelected");
    chooseCommentItem();
    expect(requestComment).toHaveBeenCalledWith("the **selected** words");
  });

  it("falls back to the block text when no selection is readable", () => {
    const requestComment = vi.fn();
    controllerRef.current = { requestComment };
    render("some claim");

    openMenuByRightClick();

    expect(readSelection).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("comment.menu.item");
    expect(container.textContent).not.toContain("comment.menu.itemSelected");
    chooseCommentItem();
    expect(requestComment).toHaveBeenCalledWith("some claim");
  });
});
