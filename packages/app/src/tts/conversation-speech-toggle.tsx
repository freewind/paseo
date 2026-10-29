import { useCallback, useMemo } from "react";
import { Volume2, VolumeX } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useAppSettings } from "@/hooks/use-settings";
import { AgentControlTrigger } from "@/composer/agent-controls/control";
import { useActiveTtsAgentId } from "./active-tts-agent";
import { isConversationSpeechEnabled } from "./conversation-speech";
import { useTts } from "@/hooks/use-tts";

/** 朗读偏好只存本机，且每台主机的会话各自独立。 */
export function ConversationSpeechToggle({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const activeAgentId = useActiveTtsAgentId(serverId);
  const { stop } = useTts();
  const key = JSON.stringify([serverId, agentId]);
  const enabled = isConversationSpeechEnabled(settings, serverId, agentId);
  const accessibilityState = useMemo(() => ({ selected: enabled }), [enabled]);
  const toggle = useCallback(() => {
    if (enabled && activeAgentId === agentId) stop();
    void updateSettings({ ttsConversations: { ...settings.ttsConversations, [key]: !enabled } });
  }, [updateSettings, settings.ttsConversations, key, enabled, activeAgentId, agentId, stop]);
  if (!settings.ttsEnabled) return null;
  return (
    <AgentControlTrigger
      icon={enabled ? Volume2 : VolumeX}
      surface="toolbar"
      label={t(enabled ? "composer.readAloud.stop" : "composer.readAloud.start")}
      showToolbarLabel={false}
      onPress={toggle}
      accessibilityLabel={t(enabled ? "composer.readAloud.stop" : "composer.readAloud.start")}
      accessibilityState={accessibilityState}
      testID="conversation-read-aloud-toggle"
    />
  );
}
