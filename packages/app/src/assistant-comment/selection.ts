/**
 * The text the user has selected, as Markdown, or `null` when there is no usable selection.
 *
 * The default implementation, and the one TypeScript resolves `@/assistant-comment/selection` to:
 * it always answers `null`. Metro picks the platform file at build time, so a real build never
 * runs it: `selection.web.ts` reads the browser selection, `selection.native.ts` the native one.
 */
export function readAssistantCommentSelection(): string | null {
  return null;
}
