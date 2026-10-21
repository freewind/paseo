import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { SelectField } from "@/components/ui/select-field";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import type {
  TransferWorkspaceProject,
  TransferWorkspaceSelection,
} from "./use-agent-transfer-workspace";

const CREATE_WORKSPACE_VALUE = "__create__";

interface ProjectOptionValue {
  viewKey: string;
}

export interface AgentTransferWorkspaceModalProps {
  visible: boolean;
  agentTitle: string;
  projects: readonly TransferWorkspaceProject[];
  onClose: () => void;
  onSelect: (selection: TransferWorkspaceSelection) => void;
  testID?: string;
}

/**
 * Pick a destination for an agent transfer: first the project, then one of its workspaces
 * or an implicit "create new workspace" entry. Both pickers are searchable; the filters are
 * applied here with a plain case-sensitive substring match and the combobox keeps ranking
 * the surviving options.
 */
export const AgentTransferWorkspaceModal = memo(function AgentTransferWorkspaceModal({
  visible,
  agentTitle,
  projects,
  onClose,
  onSelect,
  testID,
}: AgentTransferWorkspaceModalProps) {
  const { t } = useTranslation();
  const [selectedProject, setSelectedProject] = useState<ProjectOptionValue | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<TransferWorkspaceSelection | null>(
    null,
  );
  const [projectSearch, setProjectSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const sheetHeader = useMemo<SheetHeader>(
    () => ({
      title: t("workspace.tabs.transfer.title", { agent: agentTitle }),
    }),
    [agentTitle, t],
  );

  const projectOptions = useMemo(() => {
    const query = projectSearch.trim();
    return projects
      .filter((project) => (query ? project.projectName.includes(query) : true))
      .map((project) => ({
        id: project.viewKey,
        value: { viewKey: project.viewKey } satisfies ProjectOptionValue,
        label: project.projectName,
      }));
  }, [projectSearch, projects]);

  const activeProject = useMemo(
    () => projects.find((project) => project.viewKey === selectedProject?.viewKey) ?? null,
    [projects, selectedProject],
  );

  const workspaceOptions = useMemo(() => {
    if (!activeProject) return [];
    const query = workspaceSearch.trim();
    const match = (label: string) => (query ? label.includes(query) : true);
    const options: Array<{
      id: string;
      value: TransferWorkspaceSelection;
      label: string;
    }> = [];
    if (!query || t("workspace.tabs.transfer.createNew").includes(query)) {
      options.push({
        id: CREATE_WORKSPACE_VALUE,
        value: { kind: "create", projectViewKey: activeProject.viewKey },
        label: t("workspace.tabs.transfer.createNew"),
      });
    }
    for (const workspace of activeProject.workspaces) {
      if (!match(workspace.label)) continue;
      options.push({
        id: workspace.workspaceId,
        value: { kind: "workspace", workspaceId: workspace.workspaceId },
        label: workspace.label,
      });
    }
    return options;
  }, [activeProject, t, workspaceSearch]);

  const handleProjectChange = useCallback((value: ProjectOptionValue) => {
    setSelectedProject(value);
    setSelectedWorkspace(null);
    setWorkspaceSearch("");
  }, []);

  const handleWorkspaceChange = useCallback((value: TransferWorkspaceSelection) => {
    setSelectedWorkspace(value);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedWorkspace) return;
    onClose();
    onSelect(selectedWorkspace);
  }, [onClose, onSelect, selectedWorkspace]);

  const selectedProjectDisplay = useMemo(
    () => (activeProject ? { label: activeProject.projectName } : null),
    [activeProject],
  );

  const selectedWorkspaceDisplay = useMemo(() => {
    if (!selectedWorkspace || !activeProject) return null;
    if (selectedWorkspace.kind === "create") {
      return { label: t("workspace.tabs.transfer.createNew") };
    }
    const workspace = activeProject.workspaces.find(
      (entry) => entry.workspaceId === selectedWorkspace.workspaceId,
    );
    return workspace ? { label: workspace.label } : null;
  }, [activeProject, selectedWorkspace, t]);

  return (
    <AdaptiveModalSheet visible={visible} onClose={onClose} header={sheetHeader} testID={testID}>
      <View style={styles.body}>
        <SelectField<ProjectOptionValue>
          label={t("workspace.tabs.transfer.projectLabel")}
          value={selectedProject}
          selectedDisplay={selectedProjectDisplay}
          options={projectOptions}
          onChange={handleProjectChange}
          placeholder={t("workspace.tabs.transfer.projectPlaceholder")}
          emptyText={t("workspace.tabs.transfer.projectEmpty")}
          searchable
          searchPlaceholder={t("workspace.tabs.transfer.searchPlaceholder")}
          onSearchQueryChange={setProjectSearch}
          testID={testID ? `${testID}-project` : "agent-transfer-workspace-project"}
        />
        <SelectField<TransferWorkspaceSelection>
          label={t("workspace.tabs.transfer.workspaceLabel")}
          value={selectedWorkspace}
          selectedDisplay={selectedWorkspaceDisplay}
          options={workspaceOptions}
          onChange={handleWorkspaceChange}
          placeholder={t("workspace.tabs.transfer.workspacePlaceholder")}
          emptyText={t("workspace.tabs.transfer.workspaceEmpty")}
          disabled={!activeProject}
          searchable
          searchPlaceholder={t("workspace.tabs.transfer.searchPlaceholder")}
          onSearchQueryChange={setWorkspaceSearch}
          testID={testID ? `${testID}-workspace` : "agent-transfer-workspace-workspace"}
        />
        <Pressable
          style={[styles.confirmButton, selectedWorkspace === null && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={selectedWorkspace === null}
          accessibilityRole="button"
          accessibilityLabel={t("workspace.tabs.transfer.confirm")}
          testID={testID ? `${testID}-confirm` : "agent-transfer-workspace-confirm"}
        >
          <Text style={styles.confirmText}>{t("workspace.tabs.transfer.confirm")}</Text>
        </Pressable>
      </View>
    </AdaptiveModalSheet>
  );
});

const styles = StyleSheet.create((theme) => ({
  body: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  confirmButton: {
    marginTop: theme.spacing[2],
    alignItems: "center",
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
}));
