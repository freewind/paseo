import type { AppSettings } from "@/hooks/use-settings/storage";

/**
 * 全局开关打开时会话会朗读，除非用户单独关掉了
 * 这个会话：没有记录表示“跟随全局默认”，而不是“保持安静”。
 */
export function isConversationSpeechEnabled(
  settings: Pick<AppSettings, "ttsEnabled" | "ttsConversations">,
  serverId: string,
  agentId: string,
): boolean {
  if (!settings.ttsEnabled) return false;
  return settings.ttsConversations[JSON.stringify([serverId, agentId])] !== false;
}
