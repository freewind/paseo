import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivePromptPublisher } from "./model";
import { ChatOutlineRail } from "./rail.web";

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

/**
 * A real browser with real layout, because the bug under test is clipping: the preview
 * card has to float over the transcript outside the rail's scroller, and jsdom has no
 * layout — an overflow-hidden ancestor crops the card in the browser while every jsdom
 * assertion still passes. Only a rendered page can prove the card is on screen and that
 * no ancestor clips it.
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

const defaultPromptText = async () => "full text";

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

async function mountRail(options?: { onRequestPromptText?: (seq: number) => Promise<string> }) {
  const container = document.createElement("div");
  container.style.position = "relative";
  // The rail now lives in the right gutter, so the panel has to fit the viewport or
  // the rail — and the card that opens from it — land off-screen.
  container.style.width = "1200px";
  container.style.height = "700px";
  document.body.appendChild(container);
  const root = createRoot(container);
  const onJumpToPrompt = vi.fn();
  const activePrompt = createActivePromptPublisher();
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

async function hoverRow(seq: number) {
  const row = document.querySelector(`[data-testid="chat-outline-text-row-${seq}"]`);
  expect(row).not.toBeNull();
  await act(async () => {
    row?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: null }));
    const { promise, resolve } = Promise.withResolvers<void>();
    // Hover intent activates on its own delay.
    setTimeout(resolve, 250);
    await promise;
  });
}

describe("ChatOutlineRail text preview in a real browser", () => {
  it("shows the hover preview on screen with no ancestor clipping it", async () => {
    // The default test viewport is narrower than a real panel, and the card is
    // anchored to a panel's gutter — size the viewport like the app's.
    await page.viewport(1280, 800);
    await mountRail({
      onRequestPromptText: async () => "The full text the reader hovered for",
    });

    await hoverRow(1);

    const rail = document.querySelector('[data-testid="chat-outline-text-rail"]');
    const preview = document.querySelector('[data-testid="chat-outline-text-preview"]');
    expect(rail).not.toBeNull();
    expect(preview).not.toBeNull();
    if (!rail || !preview) return;

    // The card must sit outside the scroller: the scroller forces overflow on itself,
    // so a nested card is cropped to the gutter in a way jsdom can never observe.
    const scroller = document.querySelector(
      '[data-testid="chat-outline-text-row-1"]',
    )?.parentElement;
    expect(scroller?.contains(preview)).toBe(false);

    // Walk the ancestor chain: no element the card renders inside may clip.
    const clippers: string[] = [];
    for (let el: Element | null = preview; el !== null; el = el.parentElement) {
      const style = getComputedStyle(el);
      for (const axis of ["overflowX", "overflowY"] as const) {
        const value = style[axis];
        if (value !== "visible" && value !== "") {
          clippers.push(`${el.tagName.toLowerCase()}.${el.className || "?"} ${axis}=${value}`);
        }
      }
    }
    expect(clippers).toEqual([]);

    // The rail sits in the right gutter, so the card opens back over the transcript it
    // describes: it ends where the rail begins, and it stays on screen doing so.
    const rect = preview.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.right).toBeLessThanOrEqual(railRect.left);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);

    expect(preview.textContent).toContain("The full text the reader hovered for");
  });
});
