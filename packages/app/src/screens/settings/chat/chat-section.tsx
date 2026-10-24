import { useCallback, useMemo } from "react";
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

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];

export function ChatSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
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
  const changeChatOutlineTextLabels = useCallback(
    (chatOutlineTextLabels: boolean) => void updateSettings({ chatOutlineTextLabels }),
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
          {isNative || settings.freewindMode ? null : (
            <>
              <SettingsSwitch
                label={t("settings.appearance.chatOutline.title")}
                hint={t("settings.appearance.chatOutline.description")}
                value={settings.chatOutlineEnabled}
                onValueChange={changeChatOutline}
              />
              {/* 🌿 A form choice, not a toggle: text only replaces the dots. */}
              <SettingsSwitch
                label={t("settings.appearance.chatOutlineTextLabels.title")}
                hint={t("settings.appearance.chatOutlineTextLabels.description")}
                value={settings.chatOutlineTextLabels}
                onValueChange={changeChatOutlineTextLabels}
              />
            </>
          )}
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
