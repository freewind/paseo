import { createAssistantSelectionClipboardContent } from "@/assistant-selection-copy/content.web";

/**
 * The selected text as Markdown, or `null` when there is no usable selection.
 *
 * Goes through the copy path rather than `Range.toString()` so a quoted selection keeps its
 * Markdown markup: selecting a paragraph with bold text quotes `**bold text**`, the same text
 * "Copy" would put on the clipboard.
 */
export function readAssistantCommentSelection(): string | null {
  const content = createAssistantSelectionClipboardContent(window.getSelection());
  const markdown = content?.plainText.trim() ?? "";
  return markdown.length > 0 ? markdown : null;
}
