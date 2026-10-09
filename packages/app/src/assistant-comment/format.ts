const QUOTE_PREFIX = "> ";

/** Blank input lines become a bare marker so the quote stays one blockquote. */
function formatQuotedLine(line: string): string {
  return line.trim().length === 0 ? ">" : QUOTE_PREFIX + line;
}

/** The quoted half of a comment: the block's markdown source, line by line. */
export function formatQuotedBlock(blockText: string): string {
  const normalized = blockText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd();
  if (normalized.length === 0) {
    return "";
  }
  return normalized.split("\n").map(formatQuotedLine).join("\n");
}

export interface CommentDraftInput {
  existingText: string;
  blockText: string;
  comment: string;
}

/**
 * What the attach action puts in the composer: the quoted block, a blank line, then the
 * comment. Existing draft text stays where it is and the append lands after it.
 */
export function buildCommentDraftText(input: CommentDraftInput): string {
  const quoted = formatQuotedBlock(input.blockText);
  const comment = input.comment.trim();
  const appended = [quoted, comment].filter((part) => part.length > 0).join("\n\n");
  const existing = input.existingText.replace(/[ \t]+$/gm, "").trimEnd();
  if (existing.length === 0) {
    return appended;
  }
  if (appended.length === 0) {
    return existing;
  }
  return existing + "\n\n" + appended;
}
