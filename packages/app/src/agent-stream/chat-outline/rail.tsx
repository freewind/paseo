import type { ActivePromptSource, ChatOutlinePrompt } from "./model";

/** Dots are the default; text is an opt-in alternative for the same navigation. */
export type ChatOutlineVariant = "dots" | "text";

export interface ChatOutlineRailProps {
  prompts: ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  onJumpToPrompt: (seq: number) => void;
  variant: ChatOutlineVariant;
  /** The transcript's content column width. The text outline takes the gutter beside it. */
  contentMaxWidth: number;
  /**
   * The prompt's complete text, for the outline's own preview. The index carries
   * only a truncated preview, so a preview of full text asks for it on demand.
   */
  onRequestPromptText: (seq: number) => Promise<string | null>;
}

// The outline is a wide-layout pointer affordance. Native navigates the transcript by
// scrolling, so there is no rail to render.
export function ChatOutlineRail(_props: ChatOutlineRailProps): null {
  return null;
}
