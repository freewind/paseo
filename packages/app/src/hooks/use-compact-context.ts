import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentCommandsQuery } from "@/hooks/use-agent-commands-query";
import { useSessionStore } from "@/stores/session-store";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { agentCommandsQueryKey } from "@/hooks/agent-commands-query";

const COMPACT_COMMAND_NAME = "compact";

/**
 * The context meter's compress action: asks the provider's own command list for `compact`
 * (case-insensitive), then sends `/<name>` as a normal prompt. Absent when the provider has no
 * such command or a turn is running, so unsupported agents never see it. The confirmation lives
 * with the surface that offers the action, so it can happen where the user pressed.
 */
export function useCompactContext(input: { serverId: string; agentId: string }) {
  const { serverId, agentId } = input;
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId);
  const { commands } = useAgentCommandsQuery({ serverId, agentId });

  const compactCommand = useMemo(
    () => commands.find((command) => command.name.toLowerCase() === COMPACT_COMMAND_NAME) ?? null,
    [commands],
  );
  const agentStatus = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(agentId)?.status ?? null,
  );
  const canCompact = compactCommand !== null && agentStatus !== "running";

  const sendCompact = useCallback(async () => {
    if (!compactCommand || !client) return;
    const text = `/${compactCommand.name}`;
    try {
      await client.sendAgentMessage(agentId, text);
    } catch (error) {
      console.error("[ContextWindow] Failed to send compact command:", error);
    }
    void queryClient.invalidateQueries({
      queryKey: agentCommandsQueryKey({ serverId, agentId }),
    });
  }, [agentId, client, compactCommand, queryClient, serverId]);

  return { canCompact, sendCompact };
}
