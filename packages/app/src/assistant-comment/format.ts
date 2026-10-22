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

export interface MemoTextInput {
  blockText: string;
  comment: string;
}

/**
 * What "add to memos" stores: the same quoted block and comment the composer would get, minus the
 * trailing blank line that exists only to keep the next typed line separate.
 */
export function buildMemoText(input: MemoTextInput): string {
  const quoted = formatQuotedBlock(input.blockText);
  const comment = input.comment.trim();
  return [quoted, comment].filter((part) => part.length > 0).join("\n\n");
}

/**
 * Trailing blank line left behind the appended content, so the next thing the user types
 * starts on its own line instead of continuing the comment.
 */
const APPEND_TRAILING = "\n\n";

/**
 * What the attach action puts in the composer: the quoted block, a blank line, then the
 * comment, then a blank line for whatever comes next. Existing draft text stays where it is
 * and the append lands after it.
 */
export function buildCommentDraftText(input: CommentDraftInput): string {
  const quoted = formatQuotedBlock(input.blockText);
  const comment = input.comment.trim();
  const appended = [quoted, comment].filter((part) => part.length > 0).join("\n\n");
  const existing = input.existingText;
  if (appended.length === 0) {
    return existing;
  }
  // The existing draft is never rewritten — trimming it would eat newlines the user kept.
  // Only the join between the two is normalized: one blank line when the draft does not
  // already end with a newline, none when it does.
  if (existing.length === 0) {
    return appended + APPEND_TRAILING;
  }
  const join = existing.endsWith("\n") ? "\n" : "\n\n";
  return existing + join + appended + APPEND_TRAILING;
}
