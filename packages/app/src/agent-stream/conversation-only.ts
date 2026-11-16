import type { StreamItem } from "@/types/stream";

function isMessageItem(item: StreamItem): boolean {
  return item.kind === "user_message" || item.kind === "assistant_message";
}

const NO_ITEMS: StreamItem[] = [];

/**
 * 当前回合的最后一条项。文字或用户消息已经出现就轮到它们占用画面，进度行让位；
 * 只有最后一条本身是活动项（思考、工具调用、任务清单等）时才显示。
 */
function findCurrentTurnActivity(
  head: readonly StreamItem[],
  tail: readonly StreamItem[],
): StreamItem | null {
  const last = head.at(-1) ?? tail.at(-1) ?? null;
  return last && !isMessageItem(last) ? last : null;
}

/** 只留消息，另留当前回合最后一条项——它本身是活动项时作为进度指示，是文字或用户消息时让位。 */
export function selectVisibleStream(input: {
  tail: StreamItem[];
  head: StreamItem[] | undefined;
  conversationOnly: boolean | undefined;
  isTurnActive: boolean;
}): { tail: StreamItem[]; head: StreamItem[] } {
  const head = input.head ?? NO_ITEMS;
  if (!input.conversationOnly) return { tail: input.tail, head };
  const progressId = input.isTurnActive ? findCurrentTurnActivity(head, input.tail)?.id : undefined;
  const keep = (item: StreamItem) => isMessageItem(item) || item.id === progressId;
  return { tail: input.tail.filter(keep), head: head.filter(keep) };
}
