import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsTextArea } from "@/components/settings-textarea";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";

const METADATA_GENERATION_DOCS_URL = "https://paseo.sh/docs/metadata-generation";
type SelectionMode = "automatic" | "preferred";

export function MetadataGenerationPage({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config, isLoading: isConfigLoading, patchConfig } = useDaemonConfig(serverId);
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
  // COMPAT(metadataTitlePrompt): gate until the daemon floor advertises v0.11.0.
  const supportsTitlePrompt = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.metadataTitlePrompt === true,
  );

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
              <Text style={settingsStyles.rowTitle}>{t("settings.metadataGeneration.model")}</Text>
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
      {supportsTitlePrompt ? <TitlePromptCard serverId={serverId} disabled={isSaving} /> : null}
    </SettingsSection>
  );
}

function TitlePromptCard({ serverId, disabled }: { serverId: string; disabled: boolean }) {
  const { t } = useTranslation();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const persistedPrompt = config?.metadataGeneration.title?.instructions ?? "";
  const [draft, setDraft] = useState(persistedPrompt);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  useEffect(() => {
    setDraft(persistedPrompt);
  }, [persistedPrompt]);

  const hasChanges = draft !== persistedPrompt;

  const handleSave = useCallback(() => {
    setIsSavingTitle(true);
    void patchConfig({ metadataGeneration: { title: { instructions: draft } } })
      .catch((error) => {
        Alert.alert(
          t("settings.metadataGeneration.saveError"),
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setIsSavingTitle(false));
  }, [draft, patchConfig, t]);

  return (
    <View style={settingsStyles.card} testID="metadata-title-prompt-card">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>
            {t("settings.metadataGeneration.titlePrompt")}
          </Text>
          <Text style={settingsStyles.rowHint}>
            {t("settings.metadataGeneration.titlePromptHint")}
          </Text>
        </View>
      </View>
      <SettingsTextArea
        testID="metadata-title-prompt-input"
        accessibilityLabel={t("settings.metadataGeneration.titlePrompt")}
        value={draft}
        onChangeText={setDraft}
        placeholder={t("settings.metadataGeneration.titlePromptPlaceholder")}
      />
      <View style={styles.titlePromptActions}>
        <Button
          variant="default"
          size="sm"
          onPress={handleSave}
          disabled={!hasChanges || isSavingTitle || disabled}
          testID="metadata-title-prompt-save"
        >
          {isSavingTitle
            ? t("settings.metadataGeneration.titlePromptSaving")
            : t("settings.metadataGeneration.titlePromptSave")}
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
  titlePromptActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
}));
