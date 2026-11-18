import type { ActivePromptSource, ChatOutlinePrompt } from "./model";

export interface ChatOutlineTextRailProps {
  prompts: readonly ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  onJumpToPrompt: (seq: number) => void;
  contentMaxWidth: number;
  agentId: string;
}

/**
 * 原生没有屏幕两侧的留缝，也没有悬停：入口是输入区上方轨道栏里的那个按钮
 * （`agent-panel` 的 `outlineEntry`），弹层由 `view` 的 `ChatOutlineSheet` 统一渲染，
 * 所以流里不再自带任何一块。
 */
export function ChatOutlineTextRail(_props: ChatOutlineTextRailProps): null {
  return null;
}
