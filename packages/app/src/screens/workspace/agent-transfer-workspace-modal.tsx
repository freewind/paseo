import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { ComboboxItem } from "@/components/ui/combobox";
import { SelectField, type SelectFieldRenderOptionInput } from "@/components/ui/select-field";
import type {
  TransferWorkspaceProject,
  TransferWorkspaceSelection,
} from "./agent-transfer-workspace-model";

const CREATE_WORKSPACE_VALUE = "__create__";

interface ProjectOptionValue {
  viewKey: string;
}

/**
 * 选一个移动目标：先选项目，再选它的工作区，或选「新建工作区」。
 *
 * 两个选择器都可搜索；过滤在这里按大小写不敏感的子串做，combobox 自己负责排序。
 * 当前工作区仍列出来但置灰，「新建」用项目 id 而不用视图 key。
 */
export const AgentTransferWorkspaceModal = memo(function AgentTransferWorkspaceModal({
  visible,
  agentTitle,
  currentWorkspaceId,
  currentCwd,
  projects,
  onClose,
  onSelect,
  testID,
}: {
  visible: boolean;
  agentTitle: string;
  currentWorkspaceId: string | null;
  currentCwd: string;
  projects: readonly TransferWorkspaceProject[];
  onClose: () => void;
  onSelect: (selection: TransferWorkspaceSelection) => void;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [selectedProjectViewKey, setSelectedProjectViewKey] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<TransferWorkspaceSelection | null>(
    null,
  );
  const [projectSearch, setProjectSearch] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const sheetHeader = useMemo<SheetHeader>(
    () => ({ title: t("workspace.tabs.transfer.title", { agent: agentTitle }) }),
    [agentTitle, t],
  );

  const projectOptions = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    return projects
      .filter((project) => (query ? project.projectName.toLowerCase().includes(query) : true))
      .map((project) => ({
        id: project.viewKey,
        value: { viewKey: project.viewKey } satisfies ProjectOptionValue,
        label: project.projectName,
      }));
  }, [projectSearch, projects]);

  const activeProject = useMemo(
    () => projects.find((project) => project.viewKey === selectedProjectViewKey) ?? null,
    [projects, selectedProjectViewKey],
  );
  const currentWorkspaceSuffix = t("workspace.tabs.transfer.currentWorkspace");
  const targetCwd = useMemo(() => {
    if (!selectedWorkspace || !activeProject) return null;
    if (selectedWorkspace.kind === "create") return activeProject.rootPath;
    return (
      activeProject.workspaces.find((entry) => entry.workspaceId === selectedWorkspace.workspaceId)
        ?.cwd ?? null
    );
  }, [activeProject, selectedWorkspace]);

  const workspaceOptions = useMemo(() => {
    if (!activeProject) return [];
    const query = workspaceSearch.trim().toLowerCase();
    const matches = (label: string) => (query ? label.toLowerCase().includes(query) : true);
    const options: Array<{
      id: string;
      value: TransferWorkspaceSelection;
      label: string;
    }> = [];
    const createLabel = t("workspace.tabs.transfer.createNew");
    if (matches(createLabel)) {
      options.push({
        id: CREATE_WORKSPACE_VALUE,
        value: {
          kind: "create",
          projectId: activeProject.projectId,
          projectName: activeProject.projectName,
        },
        label: createLabel,
      });
    }
    for (const workspace of activeProject.workspaces) {
      const label = workspace.isCurrent
        ? `${workspace.label} ${currentWorkspaceSuffix}`
        : workspace.label;
      if (!matches(label)) continue;
      options.push({
        id: workspace.workspaceId,
        value: { kind: "workspace", workspaceId: workspace.workspaceId },
        label,
      });
    }
    return options;
  }, [activeProject, currentWorkspaceSuffix, t, workspaceSearch]);

  const renderWorkspaceOption = useCallback(
    (input: SelectFieldRenderOptionInput<TransferWorkspaceSelection>) => {
      const { option, selected, active, onPress } = input;
      const isCurrent =
        option.value.kind === "workspace" && option.value.workspaceId === currentWorkspaceId;
      return (
        <ComboboxItem
          label={option.label}
          description={option.description}
          kind={option.kind}
          testID={option.testID}
          selected={selected}
          active={active}
          disabled={isCurrent}
          onPress={onPress}
        />
      );
    },
    [currentWorkspaceId],
  );

  const handleProjectChange = useCallback((value: ProjectOptionValue) => {
    setSelectedProjectViewKey(value.viewKey);
    setSelectedWorkspace(null);
    setWorkspaceSearch("");
  }, []);

  const handleWorkspaceChange = useCallback(
    (value: TransferWorkspaceSelection) => {
      if (value.kind === "workspace" && value.workspaceId === currentWorkspaceId) return;
      setSelectedWorkspace(value);
    },
    [currentWorkspaceId],
  );

  const handleConfirm = useCallback(() => {
    if (!selectedWorkspace || !targetCwd) return;
    if (
      selectedWorkspace.kind === "workspace" &&
      (selectedWorkspace.workspaceId === currentWorkspaceId ||
        !activeProject?.workspaces.some(
          (entry) =>
            entry.workspaceId === selectedWorkspace.workspaceId &&
            entry.cwd === targetCwd &&
            !entry.isCurrent,
        ))
    ) {
      return;
    }
    if (selectedWorkspace.kind === "create" && !activeProject?.rootPath) return;
    onClose();
    onSelect(selectedWorkspace);
  }, [activeProject, currentWorkspaceId, onClose, onSelect, selectedWorkspace, targetCwd]);

  const selectedProjectValue = useMemo<ProjectOptionValue | null>(
    () => (activeProject ? { viewKey: activeProject.viewKey } : null),
    [activeProject],
  );
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
          value={selectedProjectValue}
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
          renderOption={renderWorkspaceOption}
          testID={testID ? `${testID}-workspace` : "agent-transfer-workspace-workspace"}
        />
        {targetCwd ? (
          <View style={styles.cwdContainer}>
            <Text style={styles.cwdLabel}>{t("workspace.tabs.transfer.cwdLabel")}</Text>
            <Text style={styles.cwdPath} selectable>
              {t("workspace.tabs.transfer.cwdFrom", { cwd: currentCwd || "-" })}
            </Text>
            <Text style={styles.cwdPath} selectable>
              {t("workspace.tabs.transfer.cwdTo", { cwd: targetCwd })}
            </Text>
          </View>
        ) : null}
        <Button
          variant="default"
          disabled={selectedWorkspace === null || targetCwd === null}
          onPress={handleConfirm}
          testID={testID ? `${testID}-confirm` : "agent-transfer-workspace-confirm"}
        >
          {t("workspace.tabs.transfer.confirm")}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
});

const styles = StyleSheet.create((theme) => ({
  body: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  cwdContainer: {
    gap: theme.spacing[1],
  },
  cwdLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  cwdPath: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
