const QUOTE_PREFIX = "> ";

/** 空行也要带上引用标记，否则引用会被拆成两段。 */
function formatQuotedLine(line: string): string {
  return line.trim().length === 0 ? ">" : QUOTE_PREFIX + line;
}

/** 引用那一半：把消息（或选中的几句话）按行加上引用前缀。 */
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

export interface MemoTextInput {
  blockText: string;
  comment: string;
}

/** 「添加到备忘」存的内容：与评论同一段引用和正文，去掉只为续写服务的尾部空行。 */
export function buildMemoText(input: MemoTextInput): string {
  const quoted = formatQuotedBlock(input.blockText);
  const comment = input.comment.trim();
  return [quoted, comment].filter((part) => part.length > 0).join("\n\n");
}

export interface CommentDraftInput {
  existingText: string;
  blockText: string;
  comment: string;
}

/** 追加内容后面留一个空行，用户接着输入时不会粘在评论末尾。 */
const APPEND_TRAILING = "\n\n";

/**
 * 附加动作写进输入框的内容：引用、空行、评论、再一空行。已有草稿保持原样，
 * 新内容排在它后面。
 */
export function buildCommentDraftText(input: CommentDraftInput): string {
  const quoted = formatQuotedBlock(input.blockText);
  const comment = input.comment.trim();
  const appended = [quoted, comment].filter((part) => part.length > 0).join("\n\n");
  const existing = input.existingText;
  if (appended.length === 0) {
    return existing;
  }
  // 不 trim 已有草稿：那会吃掉用户有意保留的换行；只规范两段之间的接缝。
  if (existing.length === 0) {
    return appended + APPEND_TRAILING;
  }
  const join = existing.endsWith("\n") ? "\n" : "\n\n";
  return existing + join + appended + APPEND_TRAILING;
}
