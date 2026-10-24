import type { ActivePromptSource, ChatOutlinePrompt } from "./model";

export interface ChatOutlineTextRailProps {
  prompts: readonly ChatOutlinePrompt[];
  activePrompt: ActivePromptSource;
  onJumpToPrompt: (seq: number) => void;
  contentMaxWidth: number;
  agentId: string;
}

// 手机端暂不做。这是 Metro 的平台占位：删了之后 native 构建会去找 .web 那份。
export function ChatOutlineTextRail(_props: ChatOutlineTextRailProps): null {
  return null;
}
