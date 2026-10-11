/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readAssistantCommentSelection } from "./selection.web";

/**
 * The rendered shape of one Markdown block inside an assistant message: the block wrapper
 * carries its Markdown tag, and the inline formatting is a nested tagged element.
 */
const FIXTURE = [
  '<div data-testid="assistant-message">',
  '<div data-paseo-markdown-tag="p">Prefix <span data-paseo-markdown-tag="strong">bold text</span> suffix</div>',
  "</div>",
].join("");

function mountFixture(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = FIXTURE;
  document.body.append(host);
  const message = host.querySelector<HTMLElement>('[data-testid="assistant-message"]');
  if (!message) {
    throw new Error("Expected assistant message fixture");
  }
  return message;
}

function selectNodeContents(element: Element): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected browser selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function collapseSelectionIn(element: Element): void {
  const range = document.createRange();
  range.setStart(element.firstChild ?? element, 0);
  range.collapse(true);
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected browser selection");
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("readAssistantCommentSelection", () => {
  it("returns the selected text with its Markdown markup", () => {
    const message = mountFixture();
    const paragraph = message.querySelector('[data-paseo-markdown-tag="p"]');
    if (!paragraph) {
      throw new Error("Expected paragraph fixture");
    }

    selectNodeContents(paragraph);

    expect(readAssistantCommentSelection()).toBe("Prefix **bold text** suffix");
  });

  it("returns null without a selection or with a collapsed one", () => {
    mountFixture();

    expect(readAssistantCommentSelection()).toBeNull();

    const message = document.querySelector('[data-testid="assistant-message"]');
    if (!message) {
      throw new Error("Expected assistant message fixture");
    }
    collapseSelectionIn(message);

    expect(readAssistantCommentSelection()).toBeNull();
  });

  it("returns null for a selection outside an assistant message", () => {
    const outside = document.createElement("div");
    outside.textContent = "outside the transcript";
    document.body.append(outside);

    selectNodeContents(outside);

    expect(readAssistantCommentSelection()).toBeNull();
  });
});
