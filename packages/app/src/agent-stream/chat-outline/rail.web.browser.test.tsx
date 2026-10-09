import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivePromptPublisher, TEXT_ROW_MAX_HEIGHT } from "./model";
import { ChatOutlineRail } from "./rail.web";

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

/**
 * A real browser with real layout, because the subject under test is text overflow: a
 * capped row only scrolls if the glyphs actually wrap past the cap, and only a rendered
 * page can tell a row that scrolls from one that silently cut the prompt. jsdom measures
 * nothing, so it can assert the cap but never that the tail is reachable.
 */

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

function prompt(seq: number, preview: string) {
  return { seq, timestamp: new Date(seq).toISOString(), preview };
}

// Written with blank lines and hard wraps on purpose: the rail folds them, so the row's
// height must come from wrapping, never from the prompt's own line breaks.
const LONG_PROMPT = Array.from({ length: 24 }, (_, index) => `prompt line ${index + 1}`).join(
  "\n\n",
);

const defaultPromptText = async () => LONG_PROMPT;

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 8_000): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const started = performance.now();
  const tick = () => {
    if (predicate()) {
      resolve();
      return;
    }
    if (performance.now() - started > timeoutMs) {
      reject(new Error(`timed out waiting for ${what}`));
      return;
    }
    setTimeout(tick, 25);
  };
  tick();
  await promise;
}

async function mountRail(options?: {
  activeSeq?: number;
  onRequestPromptText?: (seq: number) => Promise<string>;
}) {
  const container = document.createElement("div");
  container.style.position = "relative";
  // The rail lives in the right gutter, so the panel has to fit the viewport or the rail
  // lands off-screen and every measurement reads zero.
  container.style.width = "1200px";
  container.style.height = "700px";
  document.body.appendChild(container);
  const root = createRoot(container);
  const onJumpToPrompt = vi.fn();
  const activePrompt = createActivePromptPublisher();
  if (options?.activeSeq !== undefined) activePrompt.publish(options.activeSeq);
  act(() => {
    root.render(
      <ChatOutlineRail
        prompts={[prompt(1, "First prompt"), prompt(2, "Second prompt")]}
        activePrompt={activePrompt}
        onJumpToPrompt={onJumpToPrompt}
        variant="text"
        contentMaxWidth={820}
        agentId="agent-1"
        onRequestPromptText={options?.onRequestPromptText ?? defaultPromptText}
      />,
    );
  });
  mounted.push({ root, container });

  // RNW reports the panel width through a ResizeObserver, so the text form only
  // appears after real layout has flowed.
  await waitFor(
    () => document.querySelector('[data-testid="chat-outline-text-rail"]') !== null,
    "the text rail after layout",
  );
  return container;
}

describe("ChatOutlineRail text rows in a real browser", () => {
  it("shows the whole prompt in the row and scrolls what passes the cap", async () => {
    await page.viewport(1280, 800);
    await mountRail();

    const scroller = document.querySelector<HTMLElement>(
      '[data-testid="chat-outline-text-scroll-1"]',
    );
    expect(scroller).not.toBeNull();
    if (!scroller) return;

    // The row keeps the prompt whole: nothing in the DOM is elided, the box scrolls.
    expect(scroller.textContent).toContain("prompt line 24");
    // Blank lines and hard wraps are folded away, so the prompt reads as one paragraph.
    expect(scroller.textContent).not.toContain("\n");
    expect(scroller.clientHeight).toBe(TEXT_ROW_MAX_HEIGHT);
    expect(scroller.scrollHeight).toBeGreaterThan(TEXT_ROW_MAX_HEIGHT);

    // And the tail really is reachable, not merely present in the markup.
    scroller.scrollTop = scroller.scrollHeight;
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(scroller.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
  });

  it("never opens a popover over the transcript", async () => {
    await page.viewport(1280, 800);
    await mountRail();

    const row = document.querySelector('[data-testid="chat-outline-text-row-1"]');
    expect(row).not.toBeNull();
    await act(async () => {
      row?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: null }));
      const { promise, resolve } = Promise.withResolvers<void>();
      // Hover intent activates on its own delay, so the test has to let it elapse.
      setTimeout(resolve, 250);
      await promise;
    });

    expect(document.querySelector('[data-testid="chat-outline-text-preview"]')).toBeNull();
    expect(document.querySelector('[data-testid="chat-outline-preview"]')).toBeNull();
  });

  it("separates the rows with one hairline and marks the current one in blue", async () => {
    await page.viewport(1280, 800);
    await mountRail({ activeSeq: 1 });

    const rowOne = document.querySelector<HTMLElement>('[data-testid="chat-outline-text-row-1"]');
    const rowTwo = document.querySelector<HTMLElement>('[data-testid="chat-outline-text-row-2"]');
    expect(rowOne).not.toBeNull();
    expect(rowTwo).not.toBeNull();
    if (!rowOne || !rowTwo) return;

    // The hairline is an element of its own between two rows; the first row has none.
    expect(document.querySelector('[data-testid="chat-outline-text-divider-1"]')).toBeNull();
    const divider = document.querySelector<HTMLElement>(
      '[data-testid="chat-outline-text-divider-2"]',
    );
    expect(divider).not.toBeNull();
    if (divider) {
      // Flat and full width: no radius, no box around the prompt.
      expect(getComputedStyle(divider).height).toBe("1px");
      expect(getComputedStyle(divider).borderRadius).toBe("0px");
      expect(divider.getBoundingClientRect().width).toBe(rowTwo.getBoundingClientRect().width);
    }

    // The rows are separated by space, not by the line alone. Measured on the scrollers:
    // a capped row's press target is taller than the box that clips it.
    const scrollerOne = document
      .querySelector('[data-testid="chat-outline-text-scroll-1"]')
      ?.getBoundingClientRect();
    const scrollerTwo = document
      .querySelector('[data-testid="chat-outline-text-scroll-2"]')
      ?.getBoundingClientRect();
    expect(scrollerOne).toBeDefined();
    expect(scrollerTwo).toBeDefined();
    if (scrollerOne && scrollerTwo) {
      expect(scrollerTwo.top - scrollerOne.bottom).toBeGreaterThanOrEqual(16);
    }

    const activeLabel = rowOne.firstElementChild;
    const idleLabel = rowTwo.firstElementChild;
    expect(activeLabel).not.toBeNull();
    expect(idleLabel).not.toBeNull();
    const activeColor = getComputedStyle(activeLabel as Element).color;
    expect(activeColor).not.toBe(getComputedStyle(idleLabel as Element).color);
    expect(activeColor).toBe("rgb(37, 99, 235)");
  });
});
