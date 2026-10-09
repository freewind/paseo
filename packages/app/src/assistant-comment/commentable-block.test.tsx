/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { controllerRef } = vi.hoisted(() => ({
  controllerRef: {
    current: null as null | { requestComment: (blockText: string) => void },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/assistant-comment/context", () => ({
  useAssistantComment: () => controllerRef.current,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="comment-trigger">{children}</div>
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
});
