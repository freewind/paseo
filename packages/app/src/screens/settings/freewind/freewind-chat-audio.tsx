import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TURN_COMPLETE_SOUND_IDS } from "@/audio/turn-complete-sounds";
import {
  SettingsAction,
  SettingsCard,
  SettingsSelect,
  SettingsSwitch,
} from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";
import { useTts } from "@/hooks/use-tts";

/** `ttsEngine` 选择器的哨兵值：它的值是 `string | null`，而选项都是字符串。 */
const TTS_ENGINE_DEFAULT = "";
const TTS_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => ({
  value: String(rate),
  label: `${rate}×`,
}));

export function FreewindChatAudio() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const { getVoices, speak } = useTts();
  const [ttsVoices, setTtsVoices] = useState<{ identifier: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void getVoices()
      .then((voices) => {
        if (cancelled) return;
        setTtsVoices(
          voices
            .filter((voice) => {
              const primary = voice.language.split("-")[0]?.toLowerCase();
              return primary === "zh" || primary === "en";
            })
            .map((voice) => ({ identifier: voice.identifier, name: voice.name })),
        );
        return undefined;
      })
      .catch(() => {
        if (!cancelled) setTtsVoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getVoices]);

  const changePlayTurnCompleteSound = useCallback(
    (playTurnCompleteSound: boolean) => void updateSettings({ playTurnCompleteSound }),
    [updateSettings],
  );
  const changeTurnCompleteSound = useCallback(
    (turnCompleteSound: string) => void updateSettings({ turnCompleteSound }),
    [updateSettings],
  );
  const changeTtsEnabled = useCallback(
    (ttsEnabled: boolean) => void updateSettings({ ttsEnabled }),
    [updateSettings],
  );
  const changeTtsEngine = useCallback(
    (option: string) =>
      void updateSettings({ ttsEngine: option === TTS_ENGINE_DEFAULT ? null : option }),
    [updateSettings],
  );
  const changeTtsRate = useCallback(
    (rate: string) => {
      void updateSettings({ ttsRate: Number(rate) });
    },
    [updateSettings],
  );
  const previewVoice = useCallback(() => {
    speak({
      text: t("settings.general.ttsPreview.sample"),
      voiceId: settings.ttsEngine,
      rate: settings.ttsRate,
    });
  }, [speak, settings.ttsEngine, settings.ttsRate, t]);

  const turnCompleteSoundOptions = useMemo(
    () =>
      TURN_COMPLETE_SOUND_IDS.map((value): { value: string; label: string } => ({
        value,
        label: t(`freewind.turnCompleteSound.options.${value}`),
      })),
    [t],
  );
  const ttsEngineOptions = useMemo(
    () => [
      { value: TTS_ENGINE_DEFAULT, label: t("settings.general.ttsEngine.default") },
      ...ttsVoices.map((voice) => ({ value: voice.identifier, label: voice.name })),
    ],
    [t, ttsVoices],
  );

  return (
    <SettingsCard>
      <SettingsSwitch
        label={t("freewind.playTurnCompleteSound.label")}
        hint={t("freewind.playTurnCompleteSound.description")}
        value={settings.playTurnCompleteSound}
        onValueChange={changePlayTurnCompleteSound}
      />
      <SettingsSelect
        label={t("freewind.turnCompleteSound.label")}
        hint={t("freewind.turnCompleteSound.description")}
        value={settings.turnCompleteSound}
        options={turnCompleteSoundOptions}
        onValueChange={changeTurnCompleteSound}
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
      <SettingsSelect
        label={t("settings.general.ttsRate.label")}
        value={String(settings.ttsRate)}
        options={TTS_RATE_OPTIONS}
        onValueChange={changeTtsRate}
        testID="settings-tts-rate"
      />
      <SettingsAction
        label={t("settings.general.ttsPreview.label")}
        actionLabel={t("settings.general.ttsPreview.play")}
        onPress={previewVoice}
        testID="settings-tts-preview"
      />
    </SettingsCard>
  );
}
