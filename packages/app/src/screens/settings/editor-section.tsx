import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-settings";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { usePreferredEditor } from "@/hooks/use-preferred-editor";
import { useDesktopOpenTargets } from "@/workspace/desktop-open-targets";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection, SettingsSelect } from "@/components/settings";

const NO_EDITOR_VALUE = "__none__";

export function EditorSection({ serverId }: { serverId: string | null }) {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const isLocalExecution = useIsLocalDaemon(serverId ?? "");
  const { targets } = useDesktopOpenTargets({ isLocalExecution });
  const { preferredEditorId, updatePreferredEditor } = usePreferredEditor();

  const handleChange = useCallback(
    (vimKeybindings: boolean) => void updateSettings({ vimKeybindings }),
    [updateSettings],
  );

  const editorOptions = useMemo(
    () =>
      targets
        .filter((target) => target.kind === "editor")
        .map((target) => ({ value: target.id, label: target.label })),
    [targets],
  );

  const handleEditorChange = useCallback(
    (value: string) => {
      void updatePreferredEditor(value === NO_EDITOR_VALUE ? null : value);
    },
    [updatePreferredEditor],
  );

  const selectedEditorValue = preferredEditorId ?? NO_EDITOR_VALUE;
  const showEditorRow = isLocalExecution && editorOptions.length > 0;

  return (
    <SettingsSection title={t("settings.editor.title")}>
      <View style={settingsStyles.card}>
        {showEditorRow ? (
          <SettingsSelect<string>
            label={t("settings.editor.preferredEditor")}
            hint={t("settings.editor.preferredEditorHint")}
            value={selectedEditorValue}
            options={editorOptions}
            onValueChange={handleEditorChange}
            testID="preferred-editor-select"
          />
        ) : null}
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.editor.vimKeybindings")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.editor.vimHint")}</Text>
          </View>
          <Switch
            value={settings.vimKeybindings}
            onValueChange={handleChange}
            accessibilityLabel={t("settings.editor.vimKeybindings")}
            testID="vim-keybindings-toggle"
          />
        </View>
      </View>
    </SettingsSection>
  );
}
