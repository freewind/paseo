import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivePromptPublisher, PROMPT_DETAIL_MAX_HEIGHT, TEXT_ROW_MAX_LINES } from "./model";
import { ChatOutlineRail } from "./rail.web";

// The popover's copy action reads the app toast, which the rail does not mount here.
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: vi.fn(), copied: vi.fn(), error: vi.fn() }),
}));

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

/**
 * A real browser with real layout, because the subject under test is text overflow: a
 * detail body must scroll to the prompt's last line while the outline row stays clamped.
 * jsdom measures nothing, so only a rendered page can prove the tail is reachable.
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
        contentMaxWidth={820}
        agentId="agent-1"
        onRequestPromptText={options?.onRequestPromptText ?? defaultPromptText}
        variant="freewind"
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
  it("clamps the row and scrolls the complete prompt inside the clicked detail", async () => {
    await page.viewport(1280, 800);
    await mountRail();

    const row = document.querySelector<HTMLElement>('[data-testid="chat-outline-text-row-1"]');
    expect(row).not.toBeNull();
    expect(document.querySelector('[data-testid="chat-outline-text-scroll-1"]')).toBeNull();
    expect(getComputedStyle(row!.firstElementChild as Element).webkitLineClamp).toBe(
      String(TEXT_ROW_MAX_LINES),
    );
    await page.getByTestId("chat-outline-text-row-1").click();
    await waitFor(
      () =>
        document.querySelector('[data-testid="chat-outline-prompt-detail-scroll-1"]')
          ?.textContent === LONG_PROMPT,
      "the complete prompt in the detail",
    );
    const detail = document.querySelector<HTMLElement>(
      '[data-testid="chat-outline-prompt-detail-1"]',
    )!;
    const scroller = document.querySelector<HTMLElement>(
      '[data-testid="chat-outline-prompt-detail-scroll-1"]',
    )!;
    expect(detail.getBoundingClientRect().height).toBeLessThanOrEqual(PROMPT_DETAIL_MAX_HEIGHT);
    expect(scroller.textContent).toBe(LONG_PROMPT);
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    scroller.scrollTop = scroller.scrollHeight;
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(
      Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop),
    ).toBeLessThanOrEqual(1);
    const actions = document.querySelector('[data-testid="chat-outline-prompt-detail-actions-1"]')!;
    expect(scroller.contains(actions)).toBe(false);
    expect(actions.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      detail.getBoundingClientRect().bottom,
    );
  });

  it("never opens a detail popover on hover", async () => {
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
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();
    // Hovering the text outline never lights the dots: the left rail answers its own pointer only.
    expect(document.querySelector('[data-testid="chat-outline-preview"]')).toBeNull();
  });

  it("separates the rows with a numbered hairline and marks the current one with the theme foreground", async () => {
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
      // The line is cut in the middle by the ordinal of the row below it, so the divider is
      // three parts: hairline, label, hairline. The hairlines stay flat and full width.
      expect(divider.textContent).toBe("(2)");
      const hairline = divider.firstElementChild as HTMLElement;
      expect(getComputedStyle(hairline).height).toBe("1px");
      expect(getComputedStyle(hairline).borderRadius).toBe("0px");
      expect(divider.getBoundingClientRect().width).toBe(rowTwo.getBoundingClientRect().width);

      const label = divider.children[1] as HTMLElement;
      const dividerBox = divider.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const dividerCentre = dividerBox.left + dividerBox.width / 2;
      const labelCentre = labelBox.left + labelBox.width / 2;
      expect(Math.abs(labelCentre - dividerCentre)).toBeLessThan(1);
    }

    // The rows keep their spacing without introducing independent scrollers.
    const firstBox = rowOne.getBoundingClientRect();
    const secondBox = rowTwo.getBoundingClientRect();
    expect(secondBox.top - firstBox.bottom).toBeGreaterThanOrEqual(16);

    const activeLabel = rowOne.firstElementChild;
    const idleLabel = rowTwo.firstElementChild;
    expect(activeLabel).not.toBeNull();
    expect(idleLabel).not.toBeNull();
    const activeColor = getComputedStyle(activeLabel as Element).color;
    const idleColor = getComputedStyle(idleLabel as Element).color;
    // The current prompt comes forward on the theme's own foreground pair, the way every
    // list marks its selection, so a scheme change re-weights the rail instead of
    // restyling a hand-picked hue. Values come from the unistyles test stub theme.
    expect(activeColor).toBe("rgb(17, 17, 17)");
    expect(idleColor).toBe("rgb(102, 102, 102)");
    expect(activeColor).not.toBe(idleColor);
  });
});
