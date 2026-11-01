/**
 * web 上选中的纯文本，或 `null`。
 */
export function readAssistantCommentSelection(): string | null {
  // 没有 DOM（预渲染、测试环境）时当没有选择处理，评论菜单回落到整条消息。
  if (typeof window === "undefined") {
    return null;
  }
  const text = window.getSelection()?.toString().trim() ?? "";
  return text.length > 0 ? text : null;
}
