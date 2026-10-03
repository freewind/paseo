import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@/components/settings";
import { isNative } from "@/constants/platform";
import { useAppSettings, type AppSettings } from "@/hooks/use-settings";
import { useTts } from "@/hooks/use-tts";

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];

/** Sentinel for the `ttsEngine` select, whose value is `string | null` while options are strings. */
const TTS_ENGINE_DEFAULT = "";

export function ChatSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const { getVoices } = useTts();
  const [ttsVoices, setTtsVoices] = useState<{ identifier: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getVoices()
      .then((voices) => {
        if (cancelled) return;
        setTtsVoices(
          voices
            .filter((voice) => {
              // Only offer Chinese and English voices; other languages are noise for us.
              const primary = voice.language.split("-")[0]?.toLowerCase();
              return primary === "zh" || primary === "en";
            })
            .map((voice) => ({ identifier: voice.identifier, name: voice.name })),
        );
      })
      .catch(() => {
        if (!cancelled) setTtsVoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getVoices]);

  const toolCallDetailOptions = useMemo(
    () =>
      TOOL_CALL_DETAIL_LEVELS.map((value) => ({
        value,
        label: t(`settings.general.toolCallDetail.options.${value}`),
      })),
    [t],
  );

  const changeToolCallDetailLevel = useCallback(
    (toolCallDetailLevel: AppSettings["toolCallDetailLevel"]) =>
      void updateSettings({ toolCallDetailLevel }),
    [updateSettings],
  );
  const changeAutoExpandReasoning = useCallback(
    (autoExpandReasoning: boolean) => void updateSettings({ autoExpandReasoning }),
    [updateSettings],
  );
  const changeChatOutline = useCallback(
    (chatOutlineEnabled: boolean) => void updateSettings({ chatOutlineEnabled }),
    [updateSettings],
  );
  const changeShowVoiceButton = useCallback(
    (showVoiceButton: boolean) => void updateSettings({ showVoiceButton }),
    [updateSettings],
  );
  const changeDoubleBackToExit = useCallback(
    (doubleBackToExit: boolean) => void updateSettings({ doubleBackToExit }),
    [updateSettings],
  );
  const changePlayTurnCompleteSound = useCallback(
    (playTurnCompleteSound: boolean) => void updateSettings({ playTurnCompleteSound }),
    [updateSettings],
  );
  const changeTtsEnabled = useCallback(
    (ttsEnabled: boolean) => void updateSettings({ ttsEnabled }),
    [updateSettings],
  );

  const ttsEngineOptions = useMemo(
    () => [
      { value: TTS_ENGINE_DEFAULT, label: t("settings.general.ttsEngine.default") },
      ...ttsVoices.map((voice) => ({ value: voice.identifier, label: voice.name })),
    ],
    [t, ttsVoices],
  );

  const changeTtsEngine = useCallback(
    (option: string) =>
      void updateSettings({ ttsEngine: option === TTS_ENGINE_DEFAULT ? null : option }),
    [updateSettings],
  );

  return (
    <View>
      <SettingsSection title={t("settings.appearance.detailLevel.title")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.general.autoExpandReasoning.label")}
            hint={t("settings.general.autoExpandReasoning.description")}
            value={settings.autoExpandReasoning}
            onValueChange={changeAutoExpandReasoning}
          />
          <SettingsSelect
            label={t("settings.general.toolCallDetail.label")}
            hint={t("settings.general.toolCallDetail.description")}
            value={settings.toolCallDetailLevel}
            options={toolCallDetailOptions}
            onValueChange={changeToolCallDetailLevel}
          />
          <SettingsSwitch
            label={t("settings.general.showVoiceButton.label")}
            hint={t("settings.general.showVoiceButton.description")}
            value={settings.showVoiceButton}
            onValueChange={changeShowVoiceButton}
          />
          <SettingsSwitch
            label={t("settings.general.doubleBackToExit.label")}
            hint={t("settings.general.doubleBackToExit.description")}
            value={settings.doubleBackToExit}
            onValueChange={changeDoubleBackToExit}
          />
          <SettingsSwitch
            label={t("settings.general.playTurnCompleteSound.label")}
            hint={t("settings.general.playTurnCompleteSound.description")}
            value={settings.playTurnCompleteSound}
            onValueChange={changePlayTurnCompleteSound}
          />
          <SettingsSwitch
            label={t("settings.general.ttsEnabled.label")}
            hint={t("settings.general.ttsEnabled.description")}
            value={settings.ttsEnabled}
            onValueChange={changeTtsEnabled}
          />
          {ttsVoices.length > 0 ? (
            <SettingsSelect
              label={t("settings.general.ttsEngine.label")}
              hint={t("settings.general.ttsEngine.description")}
              value={settings.ttsEngine ?? TTS_ENGINE_DEFAULT}
              options={ttsEngineOptions}
              onValueChange={changeTtsEngine}
            />
          ) : null}
          {isNative ? null : (
            <SettingsSwitch
              label={t("settings.appearance.chatOutline.title")}
              hint={t("settings.appearance.chatOutline.description")}
              value={settings.chatOutlineEnabled}
              onValueChange={changeChatOutline}
            />
          )}
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
