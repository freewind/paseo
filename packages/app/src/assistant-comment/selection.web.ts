import { createAssistantSelectionClipboardContent } from "@/assistant-selection-copy/content.web";

/**
 * web 上选中的 Markdown，或 `null`。
 *
 * 走复制那条链路而不是 `Range.toString()`：引用里要保留 Markdown 标记，选中一段加粗文字时
 * 引用出的应是 `**bold**`，与“复制”得到的文本一致。
 */
export function readAssistantCommentSelection(): string | null {
  // 没有 DOM（预渲染、测试环境）时当没有选择处理，评论菜单回落到整条消息。
  if (typeof window === "undefined") {
    return null;
  }
  const content = createAssistantSelectionClipboardContent(window.getSelection());
  const markdown = content?.plainText.trim() ?? "";
  return markdown.length > 0 ? markdown : null;
}
