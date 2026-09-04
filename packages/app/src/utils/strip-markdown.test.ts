import { describe, expect, it } from "vitest";
import { stripMarkdown } from "./strip-markdown";

describe("stripMarkdown", () => {
  it("returns empty for empty input", () => {
    expect(stripMarkdown("")).toBe("");
    expect(stripMarkdown("  ")).toBe("");
  });

  it("strips headers, emphasis, and strikethrough markers", () => {
    expect(stripMarkdown("# Title\n\nSome **bold** and *italic* and ~~struck~~ text.")).toBe(
      "Title\n\nSome bold and italic and struck text.",
    );
  });

  it("reduces links to their label and drops images", () => {
    expect(stripMarkdown("Read [the docs](https://paseo.sh) and ![logo](x.png) here.")).toBe(
      "Read the docs and here.",
    );
  });

  it("keeps fenced code content and strips the fence", () => {
    expect(stripMarkdown("```ts\nconst x = 1;\n```\nDone")).toBe("const x = 1;\nDone");
  });

  it("strips inline code backticks and list bullets", () => {
    expect(stripMarkdown("Run `npm test`\n- one\n- two\n3. three")).toBe(
      "Run npm test\none\ntwo\nthree",
    );
  });

  it("removes blockquote markers and horizontal rules", () => {
    expect(stripMarkdown("> quoted\n\n---\n\nafter")).toBe("quoted\n\nafter");
  });
});
