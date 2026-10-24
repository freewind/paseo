import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";

/**
 * Master switch for our customized build. Off returns every surface to what upstream ships.
 * The preferences that depend on it land on this page as the features that use them are
 * wired, so it never shows a control that changes nothing.
 */
export function FreewindSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const changeFreewindMode = useCallback(
    (freewindMode: boolean) => void updateSettings({ freewindMode }),
    [updateSettings],
  );

  return (
    <SettingsSection title={t("settings.freewind.title")}>
      <SettingsCard>
        <SettingsSwitch
          label={t("settings.freewind.mode.label")}
          hint={t("settings.freewind.mode.description")}
          value={settings.freewindMode}
          onValueChange={changeFreewindMode}
          testID="freewind-mode-switch"
        />
      </SettingsCard>
    </SettingsSection>
  );
}
