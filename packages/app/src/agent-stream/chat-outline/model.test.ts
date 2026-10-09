import { describe, expect, it } from "vitest";
import {
  collapsePromptWhitespace,
  createActivePromptPublisher,
  resolveTextRailWidth,
  shouldAcceptPromptIndexEpoch,
  promptTickMagnification,
  resolveActivePromptSeq,
  OUTLINE_MAGNIFY_RADIUS,
  TEXT_RAIL_GUTTER_PADDING,
  TEXT_RAIL_MAX_WIDTH,
  TEXT_RAIL_MIN_WIDTH,
  TEXT_ROW_LINE_HEIGHT,
  TEXT_ROW_MAX_HEIGHT,
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
  it("cuts a row at four and a half lines so the next line stays visible", () => {
    expect(TEXT_ROW_MAX_LINES).toBe(4.5);
    expect(TEXT_ROW_MAX_HEIGHT).toBe(TEXT_ROW_LINE_HEIGHT * TEXT_ROW_MAX_LINES);
    // Exactly half a line below the cut: the reader sees there is more to scroll.
    expect(TEXT_ROW_MAX_HEIGHT % TEXT_ROW_LINE_HEIGHT).toBe(TEXT_ROW_LINE_HEIGHT / 2);
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

describe("promptTickMagnification", () => {
  it("peaks under the pointer and decays to nothing at the radius", () => {
    expect(promptTickMagnification(0)).toBe(1);
    expect(promptTickMagnification(OUTLINE_MAGNIFY_RADIUS)).toBe(0);
    expect(promptTickMagnification(OUTLINE_MAGNIFY_RADIUS + 10)).toBe(0);
  });

  it("falls off monotonically and symmetrically around the pointer", () => {
    const above = [0, 1, 2, 3].map((distance) => promptTickMagnification(distance));
    const below = [0, -1, -2, -3].map((distance) => promptTickMagnification(distance));

    expect(above).toEqual(below);
    expect(above).toEqual([...above].sort((left, right) => right - left));
  });
});

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

describe("resolveTextRailWidth", () => {
  const CONTENT_WIDTH = 820;

  it("reports no width before the panel has been measured", () => {
    expect(resolveTextRailWidth(0, CONTENT_WIDTH)).toBeNull();
    expect(resolveTextRailWidth(-1, CONTENT_WIDTH)).toBeNull();
    expect(resolveTextRailWidth(1200, 0)).toBeNull();
  });

  it("falls back to the dot rail when the gutter cannot hold a readable line", () => {
    // Exactly one pixel under the minimum, after the gutter inset.
    const justTooNarrow = CONTENT_WIDTH + 2 * (TEXT_RAIL_GUTTER_PADDING + TEXT_RAIL_MIN_WIDTH) - 2;
    expect(resolveTextRailWidth(justTooNarrow, CONTENT_WIDTH)).toBeNull();

    const exactlyMin = CONTENT_WIDTH + 2 * (TEXT_RAIL_GUTTER_PADDING + TEXT_RAIL_MIN_WIDTH);
    expect(resolveTextRailWidth(exactlyMin, CONTENT_WIDTH)).toBe(TEXT_RAIL_MIN_WIDTH);
  });

  it("narrows as the transcript column grows", () => {
    const narrow = resolveTextRailWidth(1400, 820);
    const wider = resolveTextRailWidth(1400, 1000);
    expect(narrow).not.toBeNull();
    expect(wider).not.toBeNull();
    expect(wider!).toBeLessThan(narrow!);
  });

  it("stops growing on a very wide window", () => {
    expect(resolveTextRailWidth(4000, CONTENT_WIDTH)).toBe(TEXT_RAIL_MAX_WIDTH);
    expect(resolveTextRailWidth(2400, CONTENT_WIDTH)).toBe(TEXT_RAIL_MAX_WIDTH);
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
