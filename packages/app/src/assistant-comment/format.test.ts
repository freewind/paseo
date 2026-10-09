import { describe, expect, it } from "vitest";
import { buildCommentDraftText, formatQuotedBlock } from "./format";

describe("formatQuotedBlock", () => {
  it("prefixes every line", () => {
    expect(formatQuotedBlock("first\nsecond")).toBe("> first\n> second");
  });

  it("keeps blank lines inside the blockquote", () => {
    expect(formatQuotedBlock("first\n\nsecond")).toBe("> first\n>\n> second");
  });

  it("drops trailing whitespace and empty input", () => {
    expect(formatQuotedBlock("text   \n")).toBe("> text");
    expect(formatQuotedBlock("   ")).toBe("");
  });
});

describe("buildCommentDraftText", () => {
  it("quotes the block, a blank line, then the comment", () => {
    expect(
      buildCommentDraftText({ existingText: "", blockText: "some claim", comment: "not true" }),
    ).toBe("> some claim\n\nnot true");
  });

  it("appends after an existing draft", () => {
    expect(
      buildCommentDraftText({ existingText: "draft", blockText: "some claim", comment: "why" }),
    ).toBe("draft\n\n> some claim\n\nwhy");
  });

  it("trims the comment and skips the gap when there is none", () => {
    expect(
      buildCommentDraftText({ existingText: "", blockText: "some claim", comment: "  " }),
    ).toBe("> some claim");
  });
});
