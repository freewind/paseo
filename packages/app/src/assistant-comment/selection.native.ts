import { requireOptionalNativeModule } from "expo-modules-core";

interface PaseoTextSelectionModule {
  getSelectedText(): string | null;
}

const textSelectionModule =
  requireOptionalNativeModule<PaseoTextSelectionModule>("PaseoTextSelection") ?? null;

/**
 * The text the user has selected, or `null` when there is no usable selection. Shared by iOS and
 * Android through the `.native` suffix.
 *
 * React Native's `Text` does not expose a selection, so JS cannot read it: the Markdown blocks
 * are a `UITextView` on iOS and a `ReactTextView` on Android, and only the native view knows its
 * own selection range. Both platforms answer through the same `PaseoTextSelection` module.
 *
 * A build without this module — an older binary running a newer bundle — answers `null`, and
 * the comment menu falls back to the whole block.
 */
export function readAssistantCommentSelection(): string | null {
  const selected = textSelectionModule?.getSelectedText()?.trim() ?? "";
  return selected.length > 0 ? selected : null;
}
