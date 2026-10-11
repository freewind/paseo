/**
 * The text the user has selected, as Markdown, or `null` when there is no usable selection.
 *
 * Reading a native selection is platform work: iOS needs the custom selection menu and
 * Android's ActionMode has no extension point, so the native implementation lands later.
 * Until it does, the comment menu always falls back to the whole block.
 */
export function readAssistantCommentSelection(): string | null {
  return null;
}
