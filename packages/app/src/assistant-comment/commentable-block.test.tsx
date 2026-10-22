/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { controllerRef, selectionRef, readSelection, setStringAsync } = vi.hoisted(() => ({
  controllerRef: {
    current: null as null | { requestComment: (blockText: string) => void },
  },
  selectionRef: { current: null as string | null },
  readSelection: vi.fn(),
  setStringAsync: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("expo-clipboard", () => ({ setStringAsync }));

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
    testID,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID ?? "comment-item"} onClick={onSelect}>
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
    setStringAsync.mockClear();
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
    const item = container.querySelector<HTMLButtonElement>("[data-testid=markdown-comment-item]");
    expect(item).not.toBeNull();
    act(() => item?.click());
  }

  function chooseCopyItem(): void {
    const item = container.querySelector<HTMLButtonElement>("[data-testid=markdown-copy-item]");
    expect(item).not.toBeNull();
    act(() => item?.click());
  }

  it("copies the selected text", () => {
    controllerRef.current = { requestComment: vi.fn() };
    selectionRef.current = "copy these words";
    render("some claim");

    openMenuByLongPress();
    chooseCopyItem();

    expect(setStringAsync).toHaveBeenCalledWith("copy these words");
  });

  it("falls back to the block text when copying without a selection", () => {
    controllerRef.current = { requestComment: vi.fn() };
    render("some claim");

    openMenuByRightClick();
    chooseCopyItem();

    expect(setStringAsync).toHaveBeenCalledWith("some claim");
  });

  it("renders the copy item above the comment item", () => {
    controllerRef.current = { requestComment: vi.fn() };
    render("some claim");

    const ids = Array.from(container.querySelectorAll("[data-testid]")).map((element) =>
      element.getAttribute("data-testid"),
    );

    expect(ids.indexOf("markdown-copy-item")).toBeLessThan(ids.indexOf("markdown-comment-item"));
  });

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
    const item = container.querySelector<HTMLButtonElement>("[data-testid=markdown-comment-item]");
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
    expect(container.textContent).toContain("comment.menu.item");
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
    chooseCommentItem();
    expect(requestComment).toHaveBeenCalledWith("some claim");
  });
});
