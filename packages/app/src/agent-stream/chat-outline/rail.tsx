import type { ActivePromptSource, ChatOutlinePrompt } from "./model";

/** Which outline the chat shows: our left text rail, or the upstream dots and their list. */
export type ChatOutlineVariant = "freewind" | "dots" | "text";

export interface ChatOutlineRailProps {
  prompts: ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  onJumpToPrompt: (seq: number) => void;
  /** Upstream outline form; ignored while Freewind mode draws its own text outline. */
  variant: ChatOutlineVariant;
  /** The transcript's content column width. The outline takes the gutter beside it. */
  contentMaxWidth: number;
  /** Identifies the chat, so a collapsed outline stays collapsed for that chat alone. */
  agentId: string;
  /**
   * The prompt's complete text, for the outline's rows. The index carries only a
   * truncated preview, so the full text asks for it on demand.
   */
  onRequestPromptText: (seq: number) => Promise<string | null>;
}

// The outline is a wide-layout pointer affordance. Native navigates the transcript by
// scrolling, so there is no rail to render.
export function ChatOutlineRail(_props: ChatOutlineRailProps): null {
  return null;
}
