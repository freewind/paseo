import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ChevronDown, Play } from "lucide-react-native";
import { TURN_COMPLETE_SOUND_IDS } from "@/audio/turn-complete-sounds";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { settingsStyles } from "@/styles/settings";
import { useTurnCompleteSound } from "@/hooks/use-turn-complete-sound";
import { SettingsCard, SettingsRow, SettingsSwitch } from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";

const PREVIEW_SOUND_OPTIONS = { stopPrevious: true };

export function FreewindChatAudio() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const previewSound = useTurnCompleteSound(PREVIEW_SOUND_OPTIONS);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const openSoundPicker = useCallback(() => setSoundPickerOpen(true), []);
  const closeSoundPicker = useCallback(() => setSoundPickerOpen(false), []);
  const soundHeader = useMemo(() => ({ title: t("freewind.turnCompleteSound.label") }), [t]);

  const changePlayTurnCompleteSound = useCallback(
    (playTurnCompleteSound: boolean) => void updateSettings({ playTurnCompleteSound }),
    [updateSettings],
  );
  const changeTurnCompleteSound = useCallback(
    (turnCompleteSound: string) => {
      void updateSettings({ turnCompleteSound });
      closeSoundPicker();
    },
    [closeSoundPicker, updateSettings],
  );

  const turnCompleteSoundOptions = useMemo(
    () =>
      TURN_COMPLETE_SOUND_IDS.map((value): { value: string; label: string } => ({
        value,
        label: t(`freewind.turnCompleteSound.options.${value}`),
      })),
    [t],
  );
  const selectedSoundLabel =
    turnCompleteSoundOptions.find((option) => option.value === settings.turnCompleteSound)?.label ??
    settings.turnCompleteSound;

  return (
    <SettingsCard>
      <SettingsSwitch
        label={t("freewind.playTurnCompleteSound.label")}
        hint={t("freewind.playTurnCompleteSound.description")}
        value={settings.playTurnCompleteSound}
        onValueChange={changePlayTurnCompleteSound}
      />
      <SettingsRow
        label={t("freewind.turnCompleteSound.label")}
        hint={t("freewind.turnCompleteSound.description")}
      >
        <Button
          variant="outline"
          leftIcon={ChevronDown}
          onPress={openSoundPicker}
          accessibilityLabel={`${t("freewind.turnCompleteSound.label")}: ${selectedSoundLabel}`}
        >
          {selectedSoundLabel}
        </Button>
        <AdaptiveModalSheet
          visible={soundPickerOpen}
          onClose={closeSoundPicker}
          header={soundHeader}
          testID="turn-complete-sound-picker"
        >
          <View style={settingsStyles.card} accessibilityRole="radiogroup">
            {turnCompleteSoundOptions.map((option) => (
              <SoundOption
                key={option.value}
                value={option.value}
                label={option.label}
                selected={option.value === settings.turnCompleteSound}
                onSelect={changeTurnCompleteSound}
                onPreview={previewSound}
              />
            ))}
          </View>
        </AdaptiveModalSheet>
      </SettingsRow>
    </SettingsCard>
  );
}

function SoundOption({
  value,
  label,
  selected,
  onSelect,
  onPreview,
}: {
  value: string;
  label: string;
  selected: boolean;
  onSelect: (value: string) => void;
  onPreview: (value: string) => void;
}) {
  const { t } = useTranslation();
  const select = useCallback(() => onSelect(value), [onSelect, value]);
  const preview = useCallback(() => onPreview(value), [onPreview, value]);
  const accessibilityState = useMemo(() => ({ checked: selected }), [selected]);
  return (
    <View style={styles.option}>
      <PressHighlight
        style={styles.optionSelect}
        onPress={select}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
        aria-checked={selected}
      >
        <View style={selected ? styles.radioSelected : styles.radio}>
          {selected ? <View style={styles.radioDot} /> : null}
        </View>
        <Text style={settingsStyles.rowTitle}>{label}</Text>
      </PressHighlight>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Play}
        accessibilityLabel={t("freewind.turnCompleteSound.preview", { name: label })}
        onPress={preview}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: theme.spacing[3],
  },
  optionSelect: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
}));
