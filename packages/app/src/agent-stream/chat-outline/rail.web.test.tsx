/**
 * @vitest-environment jsdom
 *
 * The text outline is the only place a reader scans prompt text instead of
 * counting dots, so these assert what actually reaches the DOM: a row per prompt
 * showing that prompt's whole text, a gutter taken out of the panel's slack, and a
 * click that jumps.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActivePromptPublisher, resolveTextRailWidth, TEXT_ROW_MAX_HEIGHT } from "./model";
import { ChatOutlineRail } from "./rail.web";

const CONTENT_MAX_WIDTH = 820;
/** Wide enough for the gutter to hold a readable line. */
const PANEL_WIDTH = 1600;
const NARROW_PANEL_WIDTH = 918;
/** The width useContainerWidthBelow treats as too narrow to show either form. */
const HIDDEN_PANEL_WIDTH = 600;

interface MeasuredNode {
  width: number;
  height: number;
}

let measured = new WeakMap<Element, MeasuredNode>();
const observed = new Set<Element>();

function sizeNode(node: Element, width: number, height = 900) {
  measured.set(node, { width, height });
  Object.defineProperty(node, "offsetWidth", { configurable: true, get: () => width });
  Object.defineProperty(node, "offsetHeight", { configurable: true, get: () => height });
  Object.defineProperty(node, "offsetLeft", { configurable: true, get: () => 0 });
  Object.defineProperty(node, "offsetTop", { configurable: true, get: () => 0 });
  Object.defineProperty(node, "offsetParent", { configurable: true, get: () => null });
}

/**
 * react-native-web delivers onLayout through a ResizeObserver plus an async
 * UIManager.measure, so a jsdom render reports no width until the harness sizes
 * the node and lets the observer deliver the event.
 */
interface LayoutHandlerHost extends Element {
  __reactLayoutHandler?: (event: unknown) => void;
}

function installLayoutObserver() {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        observed.add(target);
      }
      unobserve(target: Element) {
        observed.delete(target);
      }
      disconnect() {
        for (const target of observed) observed.delete(target);
      }
    },
  });
}

/** Resize and deliver the layout event RNW would deliver for that node. */
async function deliverLayout(node: Element) {
  const size = measured.get(node);
  if (!size) return;
  const handler = (node as LayoutHandlerHost).__reactLayoutHandler;
  if (typeof handler !== "function") return;
  await act(async () => {
    handler({
      nativeEvent: {
        layout: { x: 0, y: 0, width: size.width, height: size.height, left: 0, top: 0 },
      },
      timeStamp: 0,
    });
  });
}

function prompt(seq: number, preview: string) {
  return { seq, timestamp: new Date(seq).toISOString(), preview };
}

/** The default: no reader ever asked for a row's full text. */
const noPromptText = async () => null;

describe("ChatOutlineRail in its text form", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    measured = new WeakMap();
    observed.clear();
    installLayoutObserver();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  async function renderRail(
    prompts: ReturnType<typeof prompt>[],
    options?: {
      panelWidth?: number;
      activeSeq?: number;
      agentId?: string;
      onRequestPromptText?: (seq: number) => Promise<string | null>;
    },
  ) {
    const onJumpToPrompt = vi.fn();
    const activePrompt = createActivePromptPublisher();
    if (options?.activeSeq !== undefined) activePrompt.publish(options.activeSeq);
    const onRequestPromptText = options?.onRequestPromptText ?? noPromptText;

    await act(async () => {
      root?.render(
        <ChatOutlineRail
          prompts={prompts}
          activePrompt={activePrompt}
          onJumpToPrompt={onJumpToPrompt}
          variant="text"
          contentMaxWidth={CONTENT_MAX_WIDTH}
          agentId={options?.agentId ?? "agent-1"}
          onRequestPromptText={onRequestPromptText}
        />,
      );
    });

    // The rail reads its own width, which RNW only reports after a measurement.
    // Size whatever the panel measured and let RNW's handler deliver it.
    const panel = container?.firstElementChild;
    if (panel) {
      sizeNode(panel, options?.panelWidth ?? PANEL_WIDTH);
      await deliverLayout(panel);
    }
    return { onJumpToPrompt, panel };
  }

  it("shows the words beside the dots, never instead of them", async () => {
    await renderRail([prompt(1, "First prompt"), prompt(2, "Second prompt")]);

    const textRail = document.querySelector('[data-testid="chat-outline-text-rail"]');
    expect(textRail).not.toBeNull();
    // The two outlines are separate navigations, so the role query has to be scoped:
    // the dots on the left keep their own tabs.
    expect(textRail?.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-testid="chat-outline-tick-1"]')).toHaveLength(1);
    expect(document.body.textContent).toContain("First prompt");
    expect(document.body.textContent).toContain("Second prompt");
  });

  it("takes the gutter out of the panel's slack and leaves the transcript column alone", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], { panelWidth: PANEL_WIDTH });

    const rail = document.querySelector('[data-testid="chat-outline-text-rail"]');
    const expected = resolveTextRailWidth(PANEL_WIDTH, CONTENT_MAX_WIDTH);
    expect(expected).not.toBeNull();
    expect(rail?.getAttribute("style") ?? "").toContain(String(expected));
    // The gutter comes from the space beside the transcript, never from the
    // transcript's own column, so the rail must not claim the whole panel.
    expect(rail?.getAttribute("style") ?? "").not.toContain(`width: ${PANEL_WIDTH}px`);
  });

  it("keeps the dots when the panel leaves no room for a line", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], { panelWidth: NARROW_PANEL_WIDTH });

    expect(document.querySelector('[data-testid="chat-outline-text-rail"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="chat-outline-tick-1"]')).toHaveLength(1);
  });

  it("hides both forms on a panel too narrow to navigate", async () => {
    await renderRail([prompt(1, "First")], { panelWidth: HIDDEN_PANEL_WIDTH });

    expect(document.querySelector('[data-testid="chat-outline-text-rail"]')).toBeNull();
    expect(document.querySelectorAll('[data-testid="chat-outline-tick-1"]')).toHaveLength(0);
  });

  it("jumps to the prompt the reader clicks", async () => {
    const { onJumpToPrompt } = await renderRail([prompt(1, "First"), prompt(2, "Second")]);

    const rows = document.querySelectorAll('[data-testid="chat-outline-text-rail"] [role="tab"]');
    expect(rows).toHaveLength(2);
    await act(async () => {
      (rows[1] as HTMLElement).click();
    });

    expect(onJumpToPrompt).toHaveBeenCalledWith(2);
  });

  it("marks the prompt the reader is currently inside", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], { activeSeq: 2 });

    const selected = document.querySelectorAll(
      '[data-testid="chat-outline-text-rail"] [role="tab"][aria-selected="true"]',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("data-testid")).toBe("chat-outline-text-row-2");
  });

  it("reads each prompt's full text as soon as the rail renders", async () => {
    const fullText = "The whole prompt, well past the index's 120 character preview limit.";
    const onRequestPromptText = vi.fn(async () => fullText);
    await renderRail([prompt(1, "truncated preview"), prompt(2, "Second")], {
      onRequestPromptText,
    });

    // No hover and no focus: the reader scans the rail, so the row itself asks for the text.
    expect(onRequestPromptText).toHaveBeenCalledWith(1);
    expect(onRequestPromptText).toHaveBeenCalledWith(2);
    expect(document.body.textContent).toContain(fullText);
    // The text lives in the row now, so nothing floats over the transcript.
    expect(document.querySelector('[data-testid="chat-outline-text-preview"]')).toBeNull();
  });

  it("keeps the index preview when the full text cannot be read", async () => {
    await renderRail([prompt(1, "truncated preview"), prompt(2, "Second")], {
      onRequestPromptText: async () => null,
    });

    expect(document.body.textContent).toContain("truncated preview");
    expect(document.querySelector('[data-testid="chat-outline-text-preview"]')).toBeNull();
  });

  it("caps a long prompt at four lines and scrolls the rest instead of cutting it", async () => {
    const longText = "word ".repeat(80);
    await renderRail([prompt(1, "First prompt"), prompt(2, "Second prompt")], {
      onRequestPromptText: async () => longText,
    });

    const scroller = document.querySelector('[data-testid="chat-outline-text-scroll-1"]');
    expect(scroller).not.toBeNull();
    // The cap is the row's own scroller, not a line clamp that hides the tail.
    expect((scroller as HTMLElement).style.maxHeight).toBe(`${TEXT_ROW_MAX_HEIGHT}px`);
    const label = document.querySelector('[data-testid="chat-outline-text-row-1"]')
      ?.firstElementChild as HTMLElement | null;
    const styleWithClamp = label?.style as unknown as { WebkitLineClamp?: string } | undefined;
    expect(styleWithClamp?.WebkitLineClamp).toBeUndefined();
    expect(label?.textContent).toBe(longText);
  });

  it("hides the words behind a toggle and shows them again", async () => {
    await renderRail([prompt(1, "First prompt"), prompt(2, "Second prompt")]);
    const toggle = () => document.querySelector('[data-testid="chat-outline-text-toggle"]');

    expect(document.querySelector('[data-testid="chat-outline-text-rail"]')).not.toBeNull();
    await act(async () => {
      (toggle() as HTMLElement).click();
    });
    // Collapsing drops the rows but keeps the rail, so the way back stays reachable.
    expect(document.querySelectorAll('[data-testid="chat-outline-text-row-1"]')).toHaveLength(0);
    expect(document.querySelector('[data-testid="chat-outline-text-rail"]')).not.toBeNull();

    await act(async () => {
      (toggle() as HTMLElement).click();
    });
    expect(document.querySelectorAll('[data-testid="chat-outline-text-row-1"]')).toHaveLength(1);
  });

  it("keeps the dots while the words are collapsed", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")]);

    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-toggle"]') as HTMLElement).click();
    });

    // The dots are the primary navigation; collapsing the words must not take them.
    expect(document.querySelectorAll('[data-testid="chat-outline-tick-1"]')).toHaveLength(1);
  });

  it("remembers the collapse for that chat, and only that chat", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], { agentId: "agent-a" });
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-toggle"]') as HTMLElement).click();
    });
    expect(document.querySelectorAll('[data-testid="chat-outline-text-row-1"]')).toHaveLength(0);

    // Unmount for real: a re-render keeps component state alive on its own, so only a
    // fresh instance proves the choice outlived the component that recorded it. A root
    // cannot be reused once unmounted, so each mount gets its own.
    act(() => root?.unmount());
    root = createRoot(container as HTMLDivElement);
    await renderRail([prompt(1, "First"), prompt(2, "Second")], { agentId: "agent-a" });
    expect(document.querySelectorAll('[data-testid="chat-outline-text-row-1"]')).toHaveLength(0);

    // Another chat is unaffected.
    act(() => root?.unmount());
    root = createRoot(container as HTMLDivElement);
    await renderRail([prompt(1, "First"), prompt(2, "Second")], { agentId: "agent-b" });
    expect(document.querySelectorAll('[data-testid="chat-outline-text-row-1"]')).toHaveLength(1);
  });
});
