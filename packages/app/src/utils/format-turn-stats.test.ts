import { describe, expect, it } from "vitest";
import { formatSeconds, formatTurnStats } from "./format-turn-stats";

describe("formatSeconds", () => {
  it("renders milliseconds as seconds with one decimal", () => {
    expect(formatSeconds(1234)).toBe("1.2");
    expect(formatSeconds(7500)).toBe("7.5");
    expect(formatSeconds(6100)).toBe("6.1");
    expect(formatSeconds(100)).toBe("0.1");
    expect(formatSeconds(0)).toBe("0.0");
  });
});

describe("formatTurnStats", () => {
  it("renders ttft, total, tps, and tokens when all data is present", () => {
    expect(formatTurnStats({ ttftMs: 6100, durationMs: 7500, outputTokens: 112 })).toBe(
      "ttft 6.1s · total 7.5s · tps 14.9 · 112 tokens",
    );
  });

  it("omits the tokens segment when usage is missing", () => {
    expect(formatTurnStats({ ttftMs: 6100, durationMs: 7500 })).toBe("ttft 6.1s · total 7.5s");
  });

  it("omits ttft when no first delta was recorded", () => {
    expect(formatTurnStats({ durationMs: 7500, outputTokens: 112 })).toBe(
      "total 7.5s · tps 14.9 · 112 tokens",
    );
  });

  it("returns null without a duration", () => {
    expect(formatTurnStats({ ttftMs: 100 })).toBeNull();
    expect(formatTurnStats({})).toBeNull();
  });

  it("treats null fields as missing", () => {
    expect(formatTurnStats({ ttftMs: null, durationMs: 1000, outputTokens: 10 })).toBe(
      "total 1.0s · tps 10.0 · 10 tokens",
    );
  });
});
