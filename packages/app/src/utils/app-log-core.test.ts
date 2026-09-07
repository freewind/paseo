import { describe, expect, it } from "vitest";
import { formatLogLine, rotateLogContent, safeStringify, shouldRotate } from "./app-log-core";

describe("formatLogLine", () => {
  it("renders timestamp, category, and event", () => {
    expect(
      formatLogLine({
        timestamp: "2026-09-07T06:00:00.000Z",
        category: "sidebar.hidden",
        event: "toggle",
        level: "info",
      }),
    ).toBe("2026-09-07T06:00:00.000Z [sidebar.hidden] toggle");
  });

  it("appends JSON details when present", () => {
    expect(
      formatLogLine({
        timestamp: "2026-09-07T06:00:00.000Z",
        category: "add-project",
        event: "fill",
        details: { path: "/Users/x/repo" },
        level: "info",
      }),
    ).toBe('2026-09-07T06:00:00.000Z [add-project] fill {"path":"/Users/x/repo"}');
  });
});

describe("safeStringify", () => {
  it("serializes plain objects", () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
  });

  it("falls back to String for non-serializable values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(safeStringify(circular)).toBe(String(circular));
    expect(safeStringify(undefined)).toBe(String(undefined));
  });
});

describe("shouldRotate", () => {
  it("rotates once the file outgrows the cap", () => {
    expect(shouldRotate(0)).toBe(false);
    expect(shouldRotate(1024 * 1024)).toBe(false);
    expect(shouldRotate(1024 * 1024 + 1)).toBe(true);
    expect(shouldRotate(null)).toBe(false);
  });
});

describe("rotateLogContent", () => {
  it("keeps content under the cap untouched", () => {
    expect(rotateLogContent("short", 100)).toBe("short");
  });

  it("keeps the newest half starting at a line boundary", () => {
    const lines = Array.from({ length: 100 }, (_, index) => `line-${index}`);
    const content = lines.join("\n");
    const rotated = rotateLogContent(content, 50);
    expect(rotated.startsWith("line-")).toBe(true);
    // Last line is always kept.
    expect(rotated.endsWith("line-99")).toBe(true);
    expect(rotated.length).toBeLessThan(content.length);
  });
});
