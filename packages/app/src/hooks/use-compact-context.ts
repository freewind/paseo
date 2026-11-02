import { useCallback, useMemo } from "react";
import { useAgentCommandsQuery } from "@/hooks/use-agent-commands-query";
import { composerSubmitKey, submitComposerText } from "@/composer/composer-submit";

const COMPACT_COMMAND_NAME = "compact";

/**
 * 用量指示上的压缩动作：从 provider 自己的命令列表里找 `compact`（忽略大小写）。
 *
 * 只要有这个命令就随时可点。点击走 composer 的发送入口，等于发一条新消息：空闲时直接
 * 发出，有回合在跑时排队；用户手上已有草稿时先把它发出去，再发指令本身。provider 不
 * 支持压缩时看不到入口。
 *
 * 为什么不必等回合结束：长回合会把上下文占满，用户想把压缩先排上队，而不是等回合停了
 * 再去翻斜杠命令。入口放在用量指示上，正是因为看用量的时候就是想压缩的时候。
 */
export function useCompactContext(input: { serverId: string; agentId: string }) {
  const { serverId, agentId } = input;
  const { commands } = useAgentCommandsQuery({ serverId, agentId });

  const compactCommand = useMemo(
    () => commands.find((command) => command.name.toLowerCase() === COMPACT_COMMAND_NAME) ?? null,
    [commands],
  );
  const canCompact = compactCommand !== null;

  const sendCompact = useCallback(() => {
    if (!compactCommand) return;
    submitComposerText(composerSubmitKey(serverId, agentId), `/${compactCommand.name}`, {
      includeDraft: true,
    });
  }, [agentId, compactCommand, serverId]);

  return { canCompact, sendCompact };
}
