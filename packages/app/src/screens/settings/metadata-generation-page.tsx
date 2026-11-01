import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
import {
  METADATA_PROMPT_DEFAULTS,
  METADATA_PROMPT_KEYS,
  type MetadataPromptKey,
} from "@getpaseo/protocol/metadata-prompts";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { ExternalLink } from "@/components/ui/external-link";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsTextArea } from "@/components/settings-textarea";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { useHostFeature } from "@/runtime/host-features";
import { settingsStyles } from "@/styles/settings";

const METADATA_GENERATION_DOCS_URL = "https://paseo.sh/docs/metadata-generation";
type SelectionMode = "automatic" | "preferred";

export function MetadataGenerationPage({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config, isLoading: isConfigLoading, patchConfig } = useDaemonConfig(serverId);
  const supportsPrompts = useHostFeature(serverId, "metadataPrompts");
  const snapshot = useProvidersSnapshot(serverId);
  const providers = useMemo(
    () => buildSelectableProviderSelectorProviders(snapshot.entries),
    [snapshot.entries],
  );
  const configuredProviders = config?.metadataGeneration.providers;
  const configuredProvider = configuredProviders?.[0] ?? null;
  const savedMode: SelectionMode = configuredProvider ? "preferred" : "automatic";
  const [draftMode, setDraftMode] = useState<SelectionMode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const mode = draftMode ?? savedMode;

  useEffect(() => {
    setDraftMode(null);
  }, [configuredProvider?.model, configuredProvider?.provider]);

  const modeOptions = useMemo(
    () => [
      { value: "automatic" as const, label: t("settings.metadataGeneration.automatic") },
      { value: "preferred" as const, label: t("settings.metadataGeneration.preferred") },
    ],
    [t],
  );

  const saveProviders = useCallback(
    async (providersPatch: { provider: string; model?: string }[]) => {
      setIsSaving(true);
      try {
        await patchConfig({ metadataGeneration: { providers: providersPatch } });
      } catch (error) {
        setDraftMode(null);
        Alert.alert(
          t("settings.metadataGeneration.saveError"),
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [patchConfig, t],
  );

  const handleModeChange = useCallback(
    (next: SelectionMode) => {
      setDraftMode(next);
      if (next === "automatic") {
        void saveProviders([]);
      }
    },
    [saveProviders],
  );

  const handleModelSelect = useCallback(
    (provider: AgentProvider, model: string) => {
      setDraftMode("preferred");
      void saveProviders([
        { provider, ...(model ? { model } : {}) },
        ...(configuredProviders?.slice(1) ?? []),
      ]);
    },
    [configuredProviders, saveProviders],
  );

  const handleSelectorOpen = useCallback(() => {
    snapshot.refetchIfStale(configuredProvider?.provider);
  }, [configuredProvider?.provider, snapshot]);
  const handleRetryProvider = useCallback(
    (provider: AgentProvider) => snapshot.refresh([provider]),
    [snapshot],
  );
  const docsLink = useMemo(
    () => (
      <ExternalLink
        href={METADATA_GENERATION_DOCS_URL}
        label={t("settings.metadataGeneration.docs")}
      />
    ),
    [t],
  );

  if (isConfigLoading || !config) {
    return (
      <View style={styles.loading}>
        <LoadingSpinner size="large" color={styles.spinnerColor.color} />
      </View>
    );
  }

  return (
    <>
      <SettingsSection
        title={t("settings.metadataGeneration.title")}
        info={t("settings.metadataGeneration.description")}
        trailing={docsLink}
        testID="metadata-generation-settings"
      >
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>
                {t("settings.metadataGeneration.selection")}
              </Text>
              <Text style={settingsStyles.rowHint}>
                {mode === "automatic"
                  ? t("settings.metadataGeneration.automaticHint")
                  : t("settings.metadataGeneration.preferredHint")}
              </Text>
            </View>
            <SegmentedControl
              options={modeOptions}
              value={mode}
              onValueChange={handleModeChange}
              size="sm"
              testID="metadata-generation-mode"
            />
          </View>
          {mode === "preferred" ? (
            <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>
                  {t("settings.metadataGeneration.model")}
                </Text>
                <Text style={settingsStyles.rowHint}>
                  {t("settings.metadataGeneration.modelHint")}
                </Text>
              </View>
              <CombinedModelSelector
                providers={providers}
                selectedProvider={configuredProvider?.provider ?? ""}
                selectedModel={configuredProvider?.model ?? ""}
                onSelect={handleModelSelect}
                isLoading={snapshot.isLoading || snapshot.isFetching}
                onOpen={handleSelectorOpen}
                onRetryProvider={handleRetryProvider}
                isRetryingProvider={snapshot.isRefreshing}
                disabled={isSaving}
                serverId={serverId}
                desktopPlacement="bottom-start"
                desktopMinWidth={360}
              />
            </View>
          ) : null}
        </View>
      </SettingsSection>
      {supportsPrompts ? (
        <SettingsSection
          title={t("settings.metadataGeneration.promptsSection")}
          info={t("settings.metadataGeneration.promptsHint")}
          testID="metadata-prompt-settings"
        >
          <View style={settingsStyles.card}>
            {METADATA_PROMPT_KEYS.map((promptKey) => (
              <MetadataPromptRow
                key={promptKey}
                serverId={serverId}
                promptKey={promptKey}
                disabled={isSaving}
              />
            ))}
          </View>
        </SettingsSection>
      ) : null}
    </>
  );
}

/**
 * 单个提示词的覆盖输入。占位符直接用协议包里的内置默认值，留空即回落到它，
 * 所以这里显示的文案和 daemon 实际使用的永远是同一份。
 */
function MetadataPromptRow({
  serverId,
  promptKey,
  disabled,
}: {
  serverId: string;
  promptKey: MetadataPromptKey;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const persisted = config?.metadataGeneration[promptKey]?.instructions ?? "";
  const [draft, setDraft] = useState(persisted);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  useEffect(() => {
    setDraft(persisted);
  }, [persisted]);

  const label = t(`settings.metadataGeneration.prompt.${promptKey}`);
  const hasChanges = draft !== persisted;

  const handleSave = useCallback(() => {
    setIsSavingPrompt(true);
    const patch = {
      metadataGeneration: { [promptKey]: { instructions: draft.trim() } },
    } as MutableDaemonConfigPatch;
    void patchConfig(patch)
      .catch((error) => {
        Alert.alert(
          t("settings.metadataGeneration.saveError"),
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setIsSavingPrompt(false));
  }, [draft, patchConfig, promptKey, t]);

  return (
    <View style={[settingsStyles.row, styles.promptRow]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{label}</Text>
      </View>
      <SettingsTextArea
        testID={`metadata-prompt-${promptKey}`}
        accessibilityLabel={label}
        value={draft}
        onChangeText={setDraft}
        placeholder={METADATA_PROMPT_DEFAULTS[promptKey]}
        style={styles.promptInput}
      />
      <View style={styles.promptActions}>
        <Button
          variant="default"
          size="sm"
          onPress={handleSave}
          disabled={!hasChanges || isSavingPrompt || disabled}
          testID={`metadata-prompt-${promptKey}-save`}
        >
          {isSavingPrompt
            ? t("settings.metadataGeneration.promptSaving")
            : t("settings.metadataGeneration.promptSave")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
  },
  spinnerColor: {
    color: theme.colors.foregroundMuted,
  },
  promptRow: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
  },
  promptInput: {
    minHeight: 56,
  },
  promptActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
