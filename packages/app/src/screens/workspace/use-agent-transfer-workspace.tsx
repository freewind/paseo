import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useHosts } from "@/runtime/host-runtime";
import { useTranslation } from "react-i18next";
import { useWorkspaceStructure } from "@/stores/session-store-hooks";
import { useSessionStore } from "@/stores/session-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { parseWorkspaceStructureKey } from "@/projects/workspace-structure";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";
import { useToast } from "@/contexts/toast-context";
import { AgentTransferWorkspaceModal } from "./agent-transfer-workspace-modal";

export interface TransferWorkspaceEntry {
  workspaceId: string;
  label: string;
  /** The agent already lives here, so the picker lists it disabled instead of hiding it. */
  isCurrent: boolean;
}

export interface TransferWorkspaceProject {
  /** The daemon treats an unknown workspace id as a project id and creates a root workspace. */
  viewKey: string;
  projectName: string;
  workspaces: readonly TransferWorkspaceEntry[];
}

export type TransferWorkspaceSelection =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "create"; projectViewKey: string };

interface UseAgentTransferWorkspaceInput {
  serverId: string;
  /** The feature gate; false renders no modal and offers no handler. */
  enabled: boolean;
}

interface UseAgentTransferWorkspaceResult {
  /** One entry per visible project with its candidate workspaces. */
  transferProjects: readonly TransferWorkspaceProject[];
  onMoveAgentToWorkspace: (agentId: string) => void;
  transferModal: ReactElement | null;
}

/**
 * Move an agent to another workspace on this daemon. Projects come from the workspace
 * structure the client already holds; each project lists its workspaces (root-directory
 * workspaces included) plus an implicit "create new" choice that the daemon resolves by
 * creating a plain directory-backed workspace at the project root, named after the agent.
 * The agent's current workspace and archiving workspaces are never offered. A running
 * turn blocks the transfer.
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
  const [pending, setPending] = useState<{
    agentId: string;
    agentTitle: string;
    currentWorkspaceId: string | null;
  } | null>(null);

  const transferProjects = useMemo<readonly TransferWorkspaceProject[]>(() => {
    if (!enabled) return [];
    const sessions = useSessionStore.getState().sessions;
    const currentWorkspaceId = pending?.currentWorkspaceId ?? null;
    const projects: TransferWorkspaceProject[] = [];
    for (const project of structure.projects) {
      const workspaces: TransferWorkspaceEntry[] = [];
      for (const workspaceKey of project.workspaceKeys) {
        const identity = parseWorkspaceStructureKey(workspaceKey);
        if (!identity) continue;
        const session = sessions[identity.serverId];
        const mapKey = resolveWorkspaceMapKeyByIdentity({
          workspaces: session?.workspaces,
          workspaceId: identity.workspaceId,
        });
        const workspace = mapKey ? session?.workspaces.get(mapKey) : null;
        if (!workspace || workspace.archivingAt) continue;
        workspaces.push({
          workspaceId: workspace.id,
          label: workspace.title ?? workspace.name,
          isCurrent: workspace.id === currentWorkspaceId,
        });
      }
      projects.push({
        viewKey: project.viewKey,
        projectName: project.projectName,
        workspaces,
      });
    }
    return projects;
  }, [enabled, pending?.currentWorkspaceId, structure.projects]);

  const onMoveAgentToWorkspace = useCallback(
    (agentId: string) => {
      if (!enabled) return;
      const agent = useSessionStore.getState().sessions[serverId]?.agents.get(agentId) ?? null;
      setPending({
        agentId,
        agentTitle: agent?.title ?? agentId,
        currentWorkspaceId: agent?.workspaceId ?? null,
      });
    },
    [enabled, serverId],
  );

  const handleSelect = useCallback(
    async (selection: TransferWorkspaceSelection) => {
      if (!pending) return;
      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      const targetWorkspaceId =
        selection.kind === "workspace" ? selection.workspaceId : selection.projectViewKey;
      const projectKey = selection.kind === "create" ? selection.projectViewKey : undefined;
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

  const handleSelectTransfer = useCallback(
    (selection: TransferWorkspaceSelection) => void handleSelect(selection),
    [handleSelect],
  );

  const transferModal = useMemo(
    () =>
      enabled ? (
        <AgentTransferWorkspaceModal
          visible={pending !== null}
          agentTitle={pending?.agentTitle ?? ""}
          projects={transferProjects}
          onClose={handleClose}
          onSelect={handleSelectTransfer}
          testID="agent-transfer-workspace"
        />
      ) : null,
    [enabled, handleClose, handleSelectTransfer, pending, transferProjects],
  );

  return { transferProjects, onMoveAgentToWorkspace, transferModal };
}
