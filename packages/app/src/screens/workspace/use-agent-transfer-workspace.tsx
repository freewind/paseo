import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore, useHosts } from "@/runtime/host-runtime";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceStructure } from "@/stores/session-store-hooks";
import { AgentTransferWorkspaceModal } from "./agent-transfer-workspace-modal";
import {
  buildTransferWorkspaceProjects,
  type TransferWorkspaceProject,
  type TransferWorkspaceSelection,
} from "./agent-transfer-workspace-model";

interface UseAgentTransferWorkspaceInput {
  serverId: string;
  /** 能力位；为 false 时不渲染弹窗、也不提供动作。 */
  enabled: boolean;
}

interface UseAgentTransferWorkspaceResult {
  /** 当前 host 上可见的每个项目及其候选工作区。 */
  transferProjects: readonly TransferWorkspaceProject[];
  onMoveAgentToWorkspace: (agentId: string) => void;
  transferWorkspaceModal: ReactElement | null;
}

/**
 * 把 agent 挪到同一 daemon 上的另一个工作区：同一个会话、同一段历史，只是换归属。
 *
 * 目标列表来自客户端已有的 workspace structure。移动是单 daemon 操作，所以只保留在当前
 * host 上有 placement 的项目；结构 key 必须解码后再查 session 的 workspaces Map。
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
    return buildTransferWorkspaceProjects({
      projects: structure.projects,
      serverId,
      sessions,
      currentWorkspaceId: pending?.currentWorkspaceId ?? null,
    });
  }, [enabled, pending?.currentWorkspaceId, serverId, structure.projects]);

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
      const target =
        selection.kind === "workspace"
          ? ({ kind: "workspace", workspaceId: selection.workspaceId } as const)
          : ({
              kind: "project",
              projectId: selection.projectId,
              title: pending.agentTitle,
            } as const);
      try {
        toast.show(t("workspace.tabs.transfer.moving"), { durationMs: null });
        const result = await client.transferAgentWorkspace(pending.agentId, target);
        const workspaceId = result.workspaceId;
        if (!workspaceId) {
          throw new Error(t("workspace.tabs.transfer.failed"));
        }
        toast.show(t("workspace.tabs.transfer.moved"), { variant: "success" });
        navigateToWorkspace({
          serverId,
          workspaceId,
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

  const transferWorkspaceModal = useMemo(
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

  return { transferProjects, onMoveAgentToWorkspace, transferWorkspaceModal };
}
