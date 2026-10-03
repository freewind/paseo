import type { StreamItem } from "@/types/stream";
import { startsNewTurn } from "@/agent-stream/turn-membership";

export interface TurnTiming {
  completedAt: Date;
  durationMs: number | null;
  /** First-delta time minus the user message timestamp (request sent -> first character). */
  ttftMs?: number;
  /** Output token count reported by the provider for the completed turn. */
  outputTokens?: number;
}

export interface StreamTurnTiming {
  byAssistantId: Map<string, TurnTiming>;
  runningStartedAt: Date | null;
}

export function deriveStreamTurnTiming(params: {
  isTurnActive: boolean;
  activeTurnStartedAt: Date | null;
  tail: StreamItem[];
  head: StreamItem[];
}): StreamTurnTiming {
  const byAssistantId = new Map<string, TurnTiming>();
  let currentUserAt: Date | null = null;
  let currentLastItemAt: Date | null = null;
  let currentFirstDeltaAt: Date | null = null;
  let currentOutputTokens: number | undefined;
  let currentAssistantIds: string[] = [];
  let previousItem: StreamItem | null = null;

  const flushCompletedTurn = () => {
    if (!currentLastItemAt || currentAssistantIds.length === 0) {
      return;
    }
    const timing: TurnTiming = {
      completedAt: currentLastItemAt,
      durationMs: currentUserAt
        ? Math.max(0, currentLastItemAt.getTime() - currentUserAt.getTime())
        : null,
      ...(currentFirstDeltaAt && currentUserAt
        ? { ttftMs: Math.max(0, currentFirstDeltaAt.getTime() - currentUserAt.getTime()) }
        : {}),
      ...(currentOutputTokens !== undefined ? { outputTokens: currentOutputTokens } : {}),
    };
    for (const id of currentAssistantIds) {
      byAssistantId.set(id, timing);
    }
  };

  const visitItem = (item: StreamItem) => {
    if (startsNewTurn(item, previousItem)) {
      flushCompletedTurn();
      currentUserAt = item.kind === "user_message" ? item.timestamp : null;
      currentLastItemAt = null;
      currentFirstDeltaAt = null;
      currentOutputTokens = undefined;
      currentAssistantIds = [];
    }
    currentLastItemAt = item.timestamp;
    if (item.kind === "assistant_message") {
      currentAssistantIds.push(item.id);
      if (!currentFirstDeltaAt && item.firstDeltaAt) {
        currentFirstDeltaAt = item.firstDeltaAt;
      }
      if (currentOutputTokens === undefined && item.usage?.outputTokens !== undefined) {
        currentOutputTokens = item.usage.outputTokens;
      }
    }
    previousItem = item;
  };

  for (const item of params.tail) {
    visitItem(item);
  }
  for (const item of params.head) {
    visitItem(item);
  }

  const runningStartedAt = params.isTurnActive ? params.activeTurnStartedAt : null;
  if (!params.isTurnActive) {
    flushCompletedTurn();
  }

  return {
    byAssistantId,
    runningStartedAt,
  };
}
