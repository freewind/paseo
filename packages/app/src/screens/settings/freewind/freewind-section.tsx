import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsCollapsibleRow,
  SettingsSection,
  SettingsSwitch,
} from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";
import { useSessionStore } from "@/stores/session-store";
import { FreewindChatAudio } from "./freewind-chat-audio";
import { FreewindPromptCard } from "./freewind-prompts";

/** Menu label, page title and the switch's hint, read from the shared resources. */
export function useFreewind() {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      title: t("freewind.title"),
      label: t("freewind.label"),
      description: t("freewind.description"),
    }),
    [t],
  );
}

export function FreewindSection() {
  const { t } = useTranslation();
  const serverId = useSessionStore((state) => Object.keys(state.sessions)[0] ?? null);
  const { settings, updateSettings } = useAppSettings();
  const changeFreewindMode = useCallback(
    (freewindMode: boolean) => void updateSettings({ freewindMode }),
    [updateSettings],
  );

  return (
    <>
      <SettingsSection title={t("freewind.title")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("freewind.label")}
            hint={t("freewind.description")}
            value={settings.freewindMode}
            onValueChange={changeFreewindMode}
            testID="freewind-mode-switch"
          />
        </SettingsCard>
      </SettingsSection>
      {settings.freewindMode && serverId ? (
        <>
          <SettingsSection title={t("freewind.audioTitle")}>
            <SettingsCard>
              <FreewindChatAudio />
            </SettingsCard>
          </SettingsSection>
          <SettingsSection title={t("freewind.promptsTitle")}>
            <SettingsCard>
              <SettingsCollapsibleRow label={t("freewind.promptsEdit")} testID="freewind-prompts">
                <FreewindPromptCard serverId={serverId} promptKey="title" />
                <FreewindPromptCard serverId={serverId} promptKey="branchName" />
                <FreewindPromptCard serverId={serverId} promptKey="commitMessage" />
                <FreewindPromptCard serverId={serverId} promptKey="pullRequest" />
              </SettingsCollapsibleRow>
            </SettingsCard>
          </SettingsSection>
        </>
      ) : null}
    </>
  );
}
