import type { ActivePromptSource, ChatOutlinePrompt } from "./model";

/** Dots are always shown; text adds a second, wordier outline beside them. */
export type ChatOutlineVariant = "dots" | "text";

export interface ChatOutlineRailProps {
  prompts: ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  onJumpToPrompt: (seq: number) => void;
  /** "text" adds a worded outline in the right gutter; the dots stay either way. */
  variant: ChatOutlineVariant;
  /** The transcript's content column width. The text outline takes the gutter beside it. */
  contentMaxWidth: number;
  /** Identifies the chat, so a collapsed outline stays collapsed for that chat alone. */
  agentId: string;
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
