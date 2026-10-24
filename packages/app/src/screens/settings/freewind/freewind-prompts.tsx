import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { SettingsTextArea } from "@/components/settings-textarea";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { settingsStyles } from "@/styles/settings";

export type MetadataPromptKey = "title" | "branchName" | "commitMessage" | "pullRequest";

/**
 * Built-in defaults, copied from the daemon so the placeholder shows exactly what an empty box
 * falls back to. Editing the daemon defaults means editing these strings too.
 */
const builtInDefaults: Record<MetadataPromptKey, string> = {
  title: [
    "An actionable task label: requested operation + concrete target + strongest distinguishing anchor (sentence case, max 80 characters).",
    "Preserve explicit identifiers such as PR or issue numbers, file paths, packages, components, commands, and quoted names when they distinguish the task.",
    'Example: "Refactor PR #2638 Playwright specs".',
  ].join("\n"),
  branchName:
    "A short task-shaped slug preserving the operation, target, and explicit identifier when present.",
  commitMessage: "Concise, imperative mood, no trailing period.",
  pullRequest: "Clear, descriptive title; body explaining what changed and why.",
};

function instructionsPatch(
  key: MetadataPromptKey,
  instructions: string,
): Record<MetadataPromptKey, { instructions: string }> {
  return { [key]: { instructions } } as Record<MetadataPromptKey, { instructions: string }>;
}

export function FreewindPromptCard({
  serverId,
  promptKey,
}: {
  serverId: string;
  promptKey: MetadataPromptKey;
}) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const persisted = config?.metadataGeneration[promptKey]?.instructions ?? "";
  const [draft, setDraft] = useState(persisted);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(persisted);
  }, [persisted]);

  const hasChanges = draft !== persisted;

  const handleSave = useCallback(() => {
    setIsSaving(true);
    void patchConfig({ metadataGeneration: instructionsPatch(promptKey, draft.trim()) })
      .catch((error) => {
        Alert.alert(
          t("freewind.prompt.saveFailed"),
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setIsSaving(false));
  }, [draft, patchConfig, promptKey, t]);

  const label = t(`freewind.prompt.${promptKey}`);
  const saveLabel = t("freewind.prompt.save");
  const savingLabel = t("freewind.prompt.saving");

  return (
    <View style={settingsStyles.card}>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{label}</Text>
          <Text style={settingsStyles.rowHint}>{t("freewind.prompt.hint")}</Text>
        </View>
      </View>
      <SettingsTextArea
        testID={`freewind-prompt-${promptKey}`}
        accessibilityLabel={label}
        value={draft}
        onChangeText={setDraft}
        placeholder={builtInDefaults[promptKey]}
        style={styles.input}
      />
      <View style={styles.actions}>
        <Button
          variant="default"
          size="sm"
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
          testID={`freewind-prompt-${promptKey}-save`}
        >
          {isSaving ? savingLabel : saveLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Two lines is enough to see what a prompt looks like; the full text is in the placeholder.
  input: {
    minHeight: 56,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
}));
