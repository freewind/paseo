import { describe, expect, it } from "vitest";
import { buildCommentDraftText, buildMemoText, formatQuotedBlock } from "./format";

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
    ).toBe("> some claim\n\nnot true\n\n");
  });

  it("appends after an existing draft", () => {
    expect(
      buildCommentDraftText({ existingText: "draft", blockText: "some claim", comment: "why" }),
    ).toBe("draft\n\n> some claim\n\nwhy\n\n");
  });

  it("leaves a trailing blank line after a quoted block with no comment", () => {
    expect(
      buildCommentDraftText({ existingText: "", blockText: "some claim", comment: "  " }),
    ).toBe("> some claim\n\n");
  });

  it("does not add a trailing blank line when there is nothing to append", () => {
    expect(buildCommentDraftText({ existingText: "draft", blockText: "  ", comment: "  " })).toBe(
      "draft",
    );
  });
});

describe("buildMemoText", () => {
  it("quotes the block, a blank line, then the comment", () => {
    expect(buildMemoText({ blockText: "some claim", comment: "not true" })).toBe(
      "> some claim\n\nnot true",
    );
  });

  it("keeps only the quote when nothing was typed", () => {
    expect(buildMemoText({ blockText: "some claim", comment: "   " })).toBe("> some claim");
  });

  it("leaves out the trailing blank line the composer needs", () => {
    expect(buildMemoText({ blockText: "some claim", comment: "not true" })).not.toMatch(/\n$/);
  });
});
