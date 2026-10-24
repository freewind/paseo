import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";
import { useSessionStore } from "@/stores/session-store";
import { FreewindChatAudio } from "./freewind-chat-audio";
import { FreewindPromptCard } from "./freewind-prompts";

/**
 * Copy lives here rather than in the i18n resources: only `en` and `zh-CN` belong to us and
 * the other locales stay byte-identical to upstream, so a key added to the resources would
 * force edits there. "Freewind" is a name, not a translated word. See AGENTS.md.
 */
const freewind = {
  en: {
    title: "Freewind mode",
    label: "Freewind mode",
    description: "Show our customized features; turn off to use the upstream app.",
  },
  zh: {
    title: "Freewind 模式",
    label: "Freewind 模式",
    description: "显示我们的定制功能；关闭后使用上游原版。",
  },
} as const;

export function useFreewind() {
  const { i18n } = useTranslation();
  return i18n.language.toLowerCase().startsWith("zh") ? freewind.zh : freewind.en;
}

export function FreewindSection() {
  const copy = useFreewind();
  const { i18n } = useTranslation();
  const isZh = i18n.language.toLowerCase().startsWith("zh");
  const serverId = useSessionStore((state) => Object.keys(state.sessions)[0] ?? null);
  const { settings, updateSettings } = useAppSettings();
  const changeFreewindMode = useCallback(
    (freewindMode: boolean) => void updateSettings({ freewindMode }),
    [updateSettings],
  );

  return (
    <SettingsSection title={copy.title}>
      <SettingsCard>
        <SettingsSwitch
          label={copy.label}
          hint={copy.description}
          value={settings.freewindMode}
          onValueChange={changeFreewindMode}
          testID="freewind-mode-switch"
        />
      </SettingsCard>
      {settings.freewindMode && serverId ? (
        <>
          <SettingsCard>
            <FreewindChatAudio />
          </SettingsCard>
          <FreewindPromptCard serverId={serverId} promptKey="title" isZh={isZh} />
          <FreewindPromptCard serverId={serverId} promptKey="branchName" isZh={isZh} />
          <FreewindPromptCard serverId={serverId} promptKey="commitMessage" isZh={isZh} />
          <FreewindPromptCard serverId={serverId} promptKey="pullRequest" isZh={isZh} />
        </>
      ) : null}
    </SettingsSection>
  );
}
