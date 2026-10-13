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
import { createActivePromptPublisher, resolveTextRailWidth } from "./model";
import { ChatOutlineRail } from "./rail.web";

const { setStringAsyncMock, toastCopiedMock, toastErrorMock } = vi.hoisted(() => ({
  setStringAsyncMock: vi.fn(() => Promise.resolve()),
  toastCopiedMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("expo-clipboard", () => ({ setStringAsync: setStringAsyncMock }));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: vi.fn(), copied: toastCopiedMock, error: toastErrorMock }),
}));

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

/**
 * jsdom lays nothing out, so the popover's window measurements are stubbed per test.
 * react-native-web attaches measureInWindow as an *own* property on the DOM node the
 * ref points at, so the stub has to land on each node the rail can measure, not on the
 * prototype.
 */
function stubMeasureInWindow(
  rect: { x?: number; y?: number; width?: number; height?: number } = {},
) {
  const { x = 1000, y = 100, width = 360, height = 80 } = rect;
  const patch = (node: Element | null) => {
    if (!node) return;
    Object.defineProperty(node, "measureInWindow", {
      configurable: true,
      get: () => (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(x, y, width, height),
      set: () => {},
    });
  };
  const panel = document.querySelector('[data-testid="chat-outline-text-rail"]')?.parentElement;
  if (panel) {
    Object.defineProperty(panel, "measureInWindow", {
      configurable: true,
      get: () => (callback: (x: number, y: number, w: number, h: number) => void) =>
        callback(100, 40, PANEL_WIDTH, height),
      set: () => {},
    });
  }
  for (const row of document.querySelectorAll('[data-testid^="chat-outline-text-row-"]')) {
    patch(row.parentElement);
  }
}

describe("ChatOutlineRail in its text form", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    measured = new WeakMap();
    observed.clear();
    setStringAsyncMock.mockClear();
    toastCopiedMock.mockClear();
    toastErrorMock.mockClear();
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
    const { onJumpToPrompt } = await renderRail([prompt(1, "First"), prompt(2, "Second")], {
      onRequestPromptText: async () => null,
    });
    stubMeasureInWindow();

    // A click opens the popover, and the jump happens from the popover: the row itself
    // no longer jumps, because the click's first job is reading the whole prompt.
    const rows = document.querySelectorAll('[data-testid="chat-outline-text-rail"] [role="tab"]');
    await act(async () => {
      (rows[1] as HTMLElement).click();
    });
    expect(onJumpToPrompt).not.toHaveBeenCalled();

    const jump = document.querySelector('[data-testid="chat-outline-prompt-detail-jump-2"]');
    expect(jump).not.toBeNull();
    await act(async () => {
      (jump as HTMLElement).click();
    });
    expect(onJumpToPrompt).toHaveBeenCalledWith(2);
  });

  it("copies the prompt's full text from the detail popover", async () => {
    const fullText = "The whole prompt, well past the index's 120 character preview limit.";
    await renderRail([prompt(1, "truncated preview"), prompt(2, "Second")], {
      onRequestPromptText: async (seq) => (seq === 1 ? fullText : null),
    });
    stubMeasureInWindow();

    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement).click();
    });
    const copy = document.querySelector(
      '[data-testid="chat-outline-prompt-detail-copy-1"]',
    ) as HTMLElement;
    expect(copy).not.toBeNull();
    await act(async () => {
      copy.click();
    });

    expect(setStringAsyncMock).toHaveBeenCalledWith(fullText);
    expect(toastCopiedMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
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

  it("folds blank lines and hard wraps out of a prompt", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], {
      onRequestPromptText: async () => "first line\n\n  second line\nthird",
    });

    const label = document.querySelector('[data-testid="chat-outline-text-row-1"]')
      ?.firstElementChild as HTMLElement | null;
    expect(label?.textContent).toBe("first line second line third");
  });

  it("keeps the index preview when the full text cannot be read", async () => {
    await renderRail([prompt(1, "truncated preview"), prompt(2, "Second")], {
      onRequestPromptText: async () => null,
    });

    expect(document.body.textContent).toContain("truncated preview");
    expect(document.querySelector('[data-testid="chat-outline-text-preview"]')).toBeNull();
  });

  it("opens the whole prompt in a popover and keeps its line breaks", async () => {
    await renderRail([prompt(1, "truncated preview"), prompt(2, "Second")], {
      onRequestPromptText: async (seq) => (seq === 1 ? "first line\n\nsecond line\nthird" : null),
    });
    stubMeasureInWindow();

    const rows = document.querySelectorAll('[data-testid="chat-outline-text-row-1"]');
    expect(rows).toHaveLength(1);
    await act(async () => {
      (rows[0] as HTMLElement).click();
    });

    const detail = document.querySelector('[data-testid="chat-outline-prompt-detail-1"]');
    expect(detail).not.toBeNull();
    const body = detail?.querySelector('[data-testid="chat-outline-prompt-detail-scroll-1"]');
    expect(body?.textContent).toContain("first line\n\nsecond line\nthird");
    // The popover is where the reader reads, so the prompt's own breaks survive; the row
    // keeps folding them, because the row is for scanning.
    const rowLabel = document.querySelector('[data-testid="chat-outline-text-row-1"]')
      ?.firstElementChild as HTMLElement | null;
    expect(rowLabel?.textContent).toBe("first line second line third");
  });

  it("closes the popover from the backdrop, the close button, and the same row", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], {
      onRequestPromptText: async () => null,
    });
    stubMeasureInWindow();

    const row = document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement;
    await act(async () => {
      row.click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).not.toBeNull();

    // Clicking away closes it.
    await act(async () => {
      (
        document.querySelector('[data-testid="chat-outline-prompt-backdrop"]') as HTMLElement
      ).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();

    // The close button closes it.
    await act(async () => {
      row.click();
    });
    await act(async () => {
      (
        document.querySelector('[data-testid="chat-outline-prompt-detail-close-1"]') as HTMLElement
      ).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();

    // Clicking the same row again closes it; clicking another row swaps the prompt.
    await act(async () => {
      row.click();
    });
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-2"]') as HTMLElement).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-2"]')).not.toBeNull();
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-2"]') as HTMLElement).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-2"]')).toBeNull();
  });

  it("falls back to the preview when the popover's own read fails", async () => {
    await renderRail([prompt(1, "truncated preview"), prompt(2, "Second")], {
      onRequestPromptText: async () => null,
    });
    stubMeasureInWindow();

    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement).click();
    });

    // A null read is a silent fallback, never an error: the popover shows what the row
    // already had.
    const body = document.querySelector('[data-testid="chat-outline-prompt-detail-scroll-1"]');
    expect(body?.textContent).toContain("truncated preview");
    expect(document.body.textContent).not.toContain("Loading");
  });

  it("shows the popover for the row that was clicked, not the one before it", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")], {
      onRequestPromptText: async (seq) => (seq === 1 ? "full first" : "full second"),
    });
    stubMeasureInWindow();

    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-2"]') as HTMLElement).click();
    });

    const body = document.querySelector('[data-testid="chat-outline-prompt-detail-scroll-2"]');
    expect(body?.textContent).toContain("full second");
    expect(body?.textContent).not.toContain("full first");
  });

  it("gives the wheel to the list: a row never carries its own scroller", async () => {
    await renderRail([prompt(1, "First prompt"), prompt(2, "Second prompt")]);

    // One scroller per rail: the list. A row that scrolled itself would eat the wheel
    // before the list got it, which is exactly the trap this layout removed.
    const scrollers = document.querySelectorAll(
      '[data-testid="chat-outline-text-rail"] [data-testid^="chat-outline-text-scroll-"]',
    );
    expect(scrollers).toHaveLength(0);
    const listScroller = document.querySelector('[data-testid="chat-outline-text-list"]');
    expect(listScroller).not.toBeNull();
  });

  it("positions the detail in panel-local coordinates with fixed actions and capped height", async () => {
    const { panel } = await renderRail([prompt(1, "First"), prompt(2, "Second")], {
      onRequestPromptText: async () => "line\n".repeat(200) + "last line",
    });
    stubMeasureInWindow({ height: 900 });
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement).click();
    });
    const detail = document.querySelector(
      '[data-testid="chat-outline-prompt-detail-1"]',
    ) as HTMLElement;
    expect(detail.parentElement).toBe(panel);
    expect(detail.style.left).toBe("532px");
    expect(detail.style.top).toBe("60px");
    expect(detail.style.maxHeight).toBe("360px");
    const body = detail.querySelector(
      '[data-testid="chat-outline-prompt-detail-scroll-1"]',
    ) as HTMLElement;
    const actions = detail.querySelector('[data-testid="chat-outline-prompt-detail-actions-1"]');
    expect(body.textContent).toContain("last line");
    expect(body.contains(actions)).toBe(false);
    expect(getComputedStyle(body).overflowY).toBe("auto");
    expect(
      document.querySelector('[data-testid="chat-outline-prompt-backdrop"]')?.parentElement,
    ).toBe(panel);
  });

  it("caps the detail to the available panel height", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")]);
    stubMeasureInWindow({ height: 240 });
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement).click();
    });
    const detail = document.querySelector(
      '[data-testid="chat-outline-prompt-detail-1"]',
    ) as HTMLElement;
    expect(detail.style.maxHeight).toBe("240px");
    expect(detail.style.top).toBe("0px");
  });

  it("closes the detail on collapse and chat switch", async () => {
    const prompts = [prompt(1, "First"), prompt(2, "Second")];
    await renderRail(prompts, { agentId: "detail-session-a" });
    stubMeasureInWindow();
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement).click();
    });
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-toggle"]') as HTMLElement).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();
    expect(document.querySelector('[data-testid="chat-outline-prompt-backdrop"]')).toBeNull();
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-toggle"]') as HTMLElement).click();
    });
    stubMeasureInWindow();
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).not.toBeNull();
    await renderRail(prompts, { agentId: "detail-session-b" });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();
    expect(document.querySelector('[data-testid="chat-outline-prompt-backdrop"]')).toBeNull();
  });

  it("shows loading and rejects stale text after changing rows and reopening", async () => {
    const reads: { seq: number; resolve: (text: string | null) => void }[] = [];
    await renderRail([prompt(1, "First\npreview"), prompt(2, "Second")], {
      onRequestPromptText: (seq) => new Promise((resolve) => reads.push({ seq, resolve })),
    });
    stubMeasureInWindow();
    const click = async (seq: number) => {
      await act(async () => {
        (
          document.querySelector(`[data-testid="chat-outline-text-row-${seq}"]`) as HTMLElement
        ).click();
      });
    };
    await click(1);
    const body = () =>
      document.querySelector('[data-testid="chat-outline-prompt-detail-scroll-1"]');
    expect(body()?.textContent).toBe("common.loading");
    const oldRead = reads[1];
    await click(2);
    await click(1);
    const newRead = reads[3];
    expect(newRead.seq).toBe(1);
    await act(async () => newRead.resolve(null));
    expect(body()?.textContent).toBe("First\npreview");
    await act(async () => oldRead.resolve("stale first"));
    expect(body()?.textContent).toBe("First\npreview");
  });

  it("rejects delayed measurements after a row switch or same-row reopen", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")]);
    stubMeasureInWindow({ height: 900 });
    const row = document.querySelector('[data-testid="chat-outline-text-row-1"]') as HTMLElement;
    const measurements: ((x: number, y: number, width: number, height: number) => void)[] = [];
    Object.defineProperty(row.parentElement, "measureInWindow", {
      configurable: true,
      get: () => (callback: (typeof measurements)[number]) => measurements.push(callback),
      set: () => {},
    });
    await act(async () => row.click());
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-1"]')).toBeNull();
    await act(async () => {
      (document.querySelector('[data-testid="chat-outline-text-row-2"]') as HTMLElement).click();
    });
    expect(document.querySelector('[data-testid="chat-outline-prompt-detail-2"]')).not.toBeNull();
    await act(async () => measurements[0](400, 500, 360, 80));
    expect(
      (document.querySelector('[data-testid="chat-outline-prompt-detail-2"]') as HTMLElement).style
        .left,
    ).toBe("532px");
    await act(async () => row.click());
    await act(async () => row.click());
    await act(async () => row.click());
    await act(async () => measurements[2](1000, 120, 360, 80));
    expect(
      (document.querySelector('[data-testid="chat-outline-prompt-detail-1"]') as HTMLElement).style
        .top,
    ).toBe("80px");
    await act(async () => measurements[1](400, 500, 360, 80));
    expect(
      (document.querySelector('[data-testid="chat-outline-prompt-detail-1"]') as HTMLElement).style
        .top,
    ).toBe("80px");
  });

  it("does not open the detail on hover", async () => {
    await renderRail([prompt(1, "First"), prompt(2, "Second")]);
    await act(async () => {
      document
        .querySelector('[data-testid="chat-outline-text-row-1"]')
        ?.parentElement?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('[data-testid="chat-outline-prompt-backdrop"]')).toBeNull();
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
