import type { AppSettings } from "@/hooks/use-settings/storage";

/**
 * A conversation reads aloud while the global switch is on, unless the user turned this
 * conversation off: an absent entry means "follow the global default", not "stay silent".
 */
export function isConversationSpeechEnabled(
  settings: Pick<AppSettings, "ttsEnabled" | "ttsConversations">,
  serverId: string,
  agentId: string,
): boolean {
  if (!settings.ttsEnabled) return false;
  return settings.ttsConversations[JSON.stringify([serverId, agentId])] !== false;
}
