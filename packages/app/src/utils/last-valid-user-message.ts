/**
 * 「哪句用户消息值得显示」只有这一份判断。最近访问的第三行用它，别处要显示
 * 最后一句时也走这里，规则不会在第二个地方长出分支。
 */

/** 摘要需要的长度门槛，按码点算：中文一字算一，emoji 算一个。 */
const MEANINGFUL_LENGTH = 6;

const LEADING_EMOJI = /^\p{Extended_Pictographic}/u;

/**
 * 一条消息在行里只占一行文字：正文里的换行与连续空白会把它撑成多行，
 * 所以折成单个空格。
 */
export function collapseMessageWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * 扩展提问是插件自动追加的追问，文案以 emoji 开头。消息不携带来源标记，只能按
 * 形态辨认——插件换了文案（例如改用 `[Paseo]` 前缀）这里就认不出来。
 */
export function isExtensionUserMessage(text: string): boolean {
  return LEADING_EMOJI.test(text.trim());
}

/** 有效：不是扩展提问，且长到能当摘要。 */
export function isValidUserMessage(text: string): boolean {
  const collapsed = collapseMessageWhitespace(text);
  if (collapsed.length === 0) {
    return false;
  }
  return !isExtensionUserMessage(collapsed) && Array.from(collapsed).length > MEANINGFUL_LENGTH;
}

/**
 * 从最近几条候选中挑一条显示，按优先级从最新往前找：
 * 1. 最后一条有效的用户消息
 * 2. 没有就退到最后一条非扩展的用户消息，短也算
 * 3. 连非扩展都没有，就用最后一条，即便它是扩展提问
 * 空白消息在每一档里都不算候选；全都为空时返回 null，行里留空而不是放占位文字。
 */
export function selectLastValidUserMessage(recent: readonly string[]): string | null {
  const candidates = recent
    .map(collapseMessageWhitespace)
    .filter((text) => text.length > 0)
    .toReversed();
  if (candidates.length === 0) {
    return null;
  }

  for (const text of candidates) {
    if (isValidUserMessage(text)) {
      return text;
    }
  }
  for (const text of candidates) {
    if (!isExtensionUserMessage(text)) {
      return text;
    }
  }
  return candidates[0] ?? null;
}
