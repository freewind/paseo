import { describe, expect, it } from "vitest";
import {
  collapsePromptWhitespace,
  createActivePromptPublisher,
  PROMPT_DETAIL_GAP,
  PROMPT_DETAIL_MAX_HEIGHT,
  PROMPT_DETAIL_WIDTH,
  resolveSideRailWidth,
  shouldAcceptPromptIndexEpoch,
  resolveActivePromptSeq,
  TEXT_RAIL_GUTTER_PADDING,
  TEXT_RAIL_MAX_WIDTH,
  TEXT_RAIL_MIN_WIDTH,
  TEXT_ROW_LINE_HEIGHT,
  TEXT_ROW_MAX_LINES,
  type ChatOutlinePrompt,
} from "./model";

describe("chat outline prompt index epoch", () => {
  it("accepts only the authoritative timeline epoch", () => {
    expect(shouldAcceptPromptIndexEpoch("epoch-2", "epoch-2")).toBe(true);
    expect(shouldAcceptPromptIndexEpoch("epoch-2", "epoch-1")).toBe(false);
  });
});

describe("chat outline row cap", () => {
  it("clamps a row at whole lines so the list stays the only scroller", () => {
    // A whole line count is what numberOfLines takes; the half-line cue belongs to the
    // scroll era, which this rail removed when the wheel was given back to the list.
    expect(Number.isInteger(TEXT_ROW_MAX_LINES)).toBe(true);
    expect(TEXT_ROW_MAX_LINES).toBe(4);
    expect(TEXT_ROW_LINE_HEIGHT).toBe(20);
  });

  it("sizes the detail popover over the rail it came from", () => {
    // The popover keeps the rail's own width budget and a height that reads as a note
    // beside the conversation, not a panel over it. The gap keeps it visually attached
    // to the row that opened it.
    expect(PROMPT_DETAIL_WIDTH).toBe(360);
    expect(PROMPT_DETAIL_MAX_HEIGHT).toBe(360);
    expect(PROMPT_DETAIL_GAP).toBeGreaterThan(0);
  });
});

describe("chat outline prompt text", () => {
  it("folds blank lines and hard wraps into single spaces", () => {
    expect(collapsePromptWhitespace("first line\nsecond line")).toBe("first line second line");
    expect(collapsePromptWhitespace("first\n\n\n   second")).toBe("first second");
    expect(collapsePromptWhitespace("\n  padded  \n")).toBe("padded");
    expect(collapsePromptWhitespace("tabbed\t\ttext")).toBe("tabbed text");
  });

  it("leaves a single-line prompt alone", () => {
    expect(collapsePromptWhitespace("one plain prompt")).toBe("one plain prompt");
  });
});

function prompt(seq: number): ChatOutlinePrompt {
  return { seq, timestamp: new Date(seq).toISOString(), preview: `prompt ${seq}` };
}

describe("resolveActivePromptSeq", () => {
  const prompts = [prompt(2), prompt(9), prompt(20)];

  it("marks the prompt whose turn the reading position sits in", () => {
    expect(resolveActivePromptSeq(prompts, 9)).toBe(9);
    expect(resolveActivePromptSeq(prompts, 14)).toBe(9);
    expect(resolveActivePromptSeq(prompts, 20)).toBe(20);
    expect(resolveActivePromptSeq(prompts, 99)).toBe(20);
  });

  it("marks nothing above the first prompt or without a reading position", () => {
    expect(resolveActivePromptSeq(prompts, 1)).toBeNull();
    expect(resolveActivePromptSeq(prompts, null)).toBeNull();
    expect(resolveActivePromptSeq([], 42)).toBeNull();
  });
});

describe("resolveSideRailWidth", () => {
  const CONTENT_WIDTH = 820;

  it("reports no width before the panel has been measured", () => {
    expect(resolveSideRailWidth(0, CONTENT_WIDTH)).toBeNull();
    expect(resolveSideRailWidth(-1, CONTENT_WIDTH)).toBeNull();
    expect(resolveSideRailWidth(1200, 0)).toBeNull();
  });

  it("reports no width when the gutter cannot hold a readable line", () => {
    // Exactly one pixel under the minimum, after the gutter inset.
    const justTooNarrow = CONTENT_WIDTH + 2 * (TEXT_RAIL_GUTTER_PADDING + TEXT_RAIL_MIN_WIDTH) - 2;
    expect(resolveSideRailWidth(justTooNarrow, CONTENT_WIDTH)).toBeNull();

    const exactlyMin = CONTENT_WIDTH + 2 * (TEXT_RAIL_GUTTER_PADDING + TEXT_RAIL_MIN_WIDTH);
    expect(resolveSideRailWidth(exactlyMin, CONTENT_WIDTH)).toBe(TEXT_RAIL_MIN_WIDTH);
  });

  it("narrows as the transcript column grows", () => {
    const narrow = resolveSideRailWidth(1400, 820);
    const wider = resolveSideRailWidth(1400, 1000);
    expect(narrow).not.toBeNull();
    expect(wider).not.toBeNull();
    expect(wider!).toBeLessThan(narrow!);
  });

  it("stops growing on a very wide window", () => {
    expect(resolveSideRailWidth(4000, CONTENT_WIDTH)).toBe(TEXT_RAIL_MAX_WIDTH);
    expect(resolveSideRailWidth(2400, CONTENT_WIDTH)).toBe(TEXT_RAIL_MAX_WIDTH);
  });
});

describe("createActivePromptPublisher", () => {
  it("notifies subscribers only when the active prompt changes", () => {
    const publisher = createActivePromptPublisher();
    let notifications = 0;
    const unsubscribe = publisher.subscribe(() => {
      notifications += 1;
    });

    publisher.publish(9);
    publisher.publish(9);
    publisher.publish(20);
    unsubscribe();
    publisher.publish(null);

    expect(notifications).toBe(2);
    expect(publisher.getActiveSeq()).toBeNull();
  });
});
