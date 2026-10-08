import { describe, expect, it } from "vitest";

import { isOutsideCompactPanelEdge, resolveMobilePanelGestureIntent } from "./gesture-intent";

describe("compact panel gesture edges", () => {
  it("allows opening from the matching quarter of the screen only", () => {
    expect([
      isOutsideCompactPanelEdge(100, 400, 1, true),
      isOutsideCompactPanelEdge(101, 400, 1, true),
      isOutsideCompactPanelEdge(299, 400, -1, true),
      isOutsideCompactPanelEdge(300, 400, -1, true),
    ]).toEqual([false, true, true, false]);
  });

  it("does not restrict non-compact layouts", () => {
    expect([
      isOutsideCompactPanelEdge(200, 400, 1, false),
      isOutsideCompactPanelEdge(200, 400, -1, false),
    ]).toEqual([false, false]);
  });
});

describe("mobile panel gesture intent", () => {
  it("blocks both panel-opening directions while the active surface owns horizontal dragging", () => {
    expect([
      resolveMobilePanelGestureIntent({
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: true,
      }),
      resolveMobilePanelGestureIntent({
        deltaX: -40,
        deltaY: 2,
        direction: -1,
        openGesturesBlocked: true,
      }),
    ]).toEqual(["fail", "fail"]);
  });

  it("keeps ordinary horizontal panel gestures available when unblocked", () => {
    expect([
      resolveMobilePanelGestureIntent({
        deltaX: 40,
        deltaY: 2,
        direction: 1,
        openGesturesBlocked: false,
      }),
      resolveMobilePanelGestureIntent({
        deltaX: -40,
        deltaY: 2,
        direction: -1,
        openGesturesBlocked: false,
      }),
    ]).toEqual(["activate", "activate"]);
  });
});
