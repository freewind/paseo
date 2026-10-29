import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-settings";
import { settingsStyles } from "@/styles/settings";
import { FreewindChatAudio } from "./freewind-chat-audio";

/** 一项都没有时页面也保留，免得设置项临时清空就把整页藏掉。 */
export function FreewindSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const handleChange = useCallback(
    (disableUncommonFeatures: boolean) => void updateSettings({ disableUncommonFeatures }),
    [updateSettings],
  );
  return (
    <SettingsSection title={t("freewind.title")}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("freewind.disableUncommonFeatures.label")}
            </Text>
            <Text style={settingsStyles.rowHint}>
              {t("freewind.disableUncommonFeatures.description")}
            </Text>
          </View>
          <Switch
            value={settings.disableUncommonFeatures}
            onValueChange={handleChange}
            accessibilityLabel={t("freewind.disableUncommonFeatures.label")}
            testID="disable-uncommon-features-toggle"
          />
        </View>
      </View>
      <FreewindChatAudio />
    </SettingsSection>
  );
}
