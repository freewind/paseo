import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TURN_COMPLETE_SOUND_IDS } from "@/audio/turn-complete-sounds";
import { SettingsCard, SettingsSelect, SettingsSwitch } from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";

export function FreewindChatAudio() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();

  const changePlayTurnCompleteSound = useCallback(
    (playTurnCompleteSound: boolean) => void updateSettings({ playTurnCompleteSound }),
    [updateSettings],
  );
  const changeTurnCompleteSound = useCallback(
    (turnCompleteSound: string) => void updateSettings({ turnCompleteSound }),
    [updateSettings],
  );

  const turnCompleteSoundOptions = useMemo(
    () =>
      TURN_COMPLETE_SOUND_IDS.map((value): { value: string; label: string } => ({
        value,
        label: t(`freewind.turnCompleteSound.options.${value}`),
      })),
    [t],
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
    </SettingsCard>
  );
}
