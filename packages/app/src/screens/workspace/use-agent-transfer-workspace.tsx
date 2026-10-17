import { useCallback, useMemo, useState, type ReactElement } from "react";
import { resolve as resolvePath } from "node:path";
import { useHosts } from "@/runtime/host-runtime";
import { useTranslation } from "react-i18next";
import { useWorkspaceStructure } from "@/stores/session-store-hooks";
import { useSessionStore } from "@/stores/session-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import {
  AgentTransferWorkspaceModal,
  type TransferWorkspaceOption,
} from "./agent-transfer-workspace-modal";

interface UseAgentTransferWorkspaceInput {
  serverId: string;
  /** The feature gate; false renders no modal and offers no handler. */
  enabled: boolean;
}

interface UseAgentTransferWorkspaceResult {
  /** One option per visible workspace plus one per project without any. */
  transferOptions: readonly TransferWorkspaceOption[];
  onMoveAgentToWorkspace: (agentId: string) => void;
  transferModal: ReactElement | null;
}

/**
 * Move an agent to another workspace on this daemon. Options come from the workspace
 * structure the client already holds: every workspace, plus every project whose
 * directory has no workspace — choosing one creates a plain directory-backed
 * workspace at the project root on the daemon. A running turn blocks the transfer.
 */
export function useAgentTransferWorkspace(
  input: UseAgentTransferWorkspaceInput,
): UseAgentTransferWorkspaceResult {
  const { serverId, enabled } = input;
  const { t } = useTranslation();
  const toast = useToast();
  const hosts = useHosts();
  const allServerIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const structure = useWorkspaceStructure(allServerIds);
  const [pending, setPending] = useState<{ agentId: string; agentTitle: string } | null>(null);

  const transferOptions = useMemo<readonly TransferWorkspaceOption[]>(() => {
    if (!enabled) return [];
    const options: TransferWorkspaceOption[] = [];
    for (const project of structure.projects) {
      const workspaces = project.workspaceKeys;
      if (workspaces.length === 0) {
        options.push({
          key: `project:${project.viewKey}`,
          label: t("workspace.tabs.transfer.createAtProjectRoot", { project: project.projectName }),
        });
        continue;
      }
      for (const workspaceKey of workspaces) {
        const workspace = useSessionStore
          .getState()
          .sessions[serverId]?.workspaces.get(workspaceKey);
        if (!workspace || workspace.archivingAt) continue;
        if (!areEquivalentPaths(workspace.workspaceDirectory, project.iconWorkingDir)) {
          options.push({
            key: `workspace:${serverId}:${workspace.id}`,
            label: workspace.title ?? workspace.name,
            detail: project.projectName,
          });
        }
      }
    }
    return options;
  }, [enabled, serverId, structure.projects, t]);

  const onMoveAgentToWorkspace = useCallback(
    (agentId: string) => {
      if (!enabled) return;
      const agent = useSessionStore.getState().sessions[serverId]?.agents.get(agentId) ?? null;
      setPending({ agentId, agentTitle: agent?.title ?? agentId });
    },
    [enabled, serverId],
  );

  const handleSelect = useCallback(
    async (option: TransferWorkspaceOption) => {
      if (!pending) return;
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      const [kind, , workspaceId] = option.key.split(":");
      if (kind === "workspace" && !workspaceId) {
        toast.error(t("workspace.tabs.transfer.failed"));
        return;
      }
      const targetWorkspaceId =
        kind === "workspace" ? (workspaceId as string) : option.key.slice("project:".length);
      const projectKey = option.key.startsWith("project:")
        ? option.key.slice("project:".length)
        : undefined;
      try {
        toast.show(t("workspace.tabs.transfer.moving"), { durationMs: null });
        const result = await client.transferAgentWorkspace(
          pending.agentId,
          targetWorkspaceId,
          projectKey ? { newWorkspaceTitle: pending.agentTitle } : undefined,
        );
        toast.show(t("workspace.tabs.transfer.moved"), { variant: "success" });
        navigateToWorkspace({
          serverId,
          workspaceId: result.newWorkspaceId ?? targetWorkspaceId,
          target: { kind: "agent", agentId: pending.agentId },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("workspace.tabs.transfer.failed"));
      } finally {
        setPending(null);
      }
    },
    [pending, serverId, t, toast],
  );

  const handleClose = useCallback(() => setPending(null), []);

  const handleOptionSelect = useCallback(
    (option: TransferWorkspaceOption) => void handleSelect(option),
    [handleSelect],
  );

  const transferModal = useMemo(
    () =>
      enabled ? (
        <AgentTransferWorkspaceModal
          visible={pending !== null}
          agentTitle={pending?.agentTitle ?? ""}
          options={transferOptions}
          onClose={handleClose}
          onSelect={handleOptionSelect}
          testID="agent-transfer-workspace"
        />
      ) : null,
    [enabled, handleOptionSelect, handleClose, pending, transferOptions],
  );

  return { transferOptions, onMoveAgentToWorkspace, transferModal };
}

function areEquivalentPaths(left: string, right: string): boolean {
  if (!left || !right) return false;
  try {
    return resolvePath(left) === resolvePath(right);
  } catch {
    return left === right;
  }
}
