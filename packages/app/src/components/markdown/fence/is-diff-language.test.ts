import { describe, expect, it } from "vitest";
import { isDiffFenceLanguage } from "./language";

describe("isDiffFenceLanguage", () => {
  it("treats patch and diff as diff fence languages", () => {
    expect(isDiffFenceLanguage("patch")).toBe(true);
    expect(isDiffFenceLanguage("diff")).toBe(true);
  });

  it("rejects other languages and null", () => {
    expect(isDiffFenceLanguage("ts")).toBe(false);
    expect(isDiffFenceLanguage("mermaid")).toBe(false);
    expect(isDiffFenceLanguage("")).toBe(false);
    expect(isDiffFenceLanguage(null)).toBe(false);
  });
});
