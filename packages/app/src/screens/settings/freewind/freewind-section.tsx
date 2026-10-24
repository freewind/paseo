import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@/components/settings";
import { useAppSettings } from "@/hooks/use-settings";

/**
 * Freewind copy lives here rather than in the i18n resources: only `en` and `zh-CN` belong
 * to us and the other locales stay byte-identical to upstream, so a key added to the
 * resources would force edits there. See AGENTS.md.
 */
const FREEWIND_COPY = {
  en: {
    title: "Freewind mode",
    label: "Freewind mode",
    description: "Show our customized features; turn off to use the upstream app.",
  },
  zh: {
    title: "自由风模式",
    label: "自由风模式",
    description: "显示我们的定制功能；关闭后使用上游原版。",
  },
} as const;

export function useFreewindCopy() {
  const { i18n } = useTranslation();
  return i18n.language.toLowerCase().startsWith("zh") ? FREEWIND_COPY.zh : FREEWIND_COPY.en;
}

export function FreewindSection() {
  const copy = useFreewindCopy();
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
    </SettingsSection>
  );
}
