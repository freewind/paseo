import type {
  DaemonClient,
  FetchAgentTimelinePayload,
} from "@getpaseo/client/internal/daemon-client";
import { useFetchQuery } from "@/data/query";
import { fetchAgentTimelineOnce } from "@/timeline/fetch-agent-timeline-once";

const SESSION_PROMPT_PREVIEWS_STALE_TIME = 60 * 60 * 1000;
const FIRST_PAGE_LIMIT = 100;
const TAIL_PAGE_LIMIT = 200;
const MAX_ADDITIONAL_PAGES = 2;
const SYSTEM_INJECTED_ENVELOPE = /^<paseo-system>\n[\s\S]*\n<\/paseo-system>$/;
const EMPTY_SESSION_PROMPT_PREVIEWS: SessionPromptPreviews = { first: null, last: null };

type TimelineClient = Pick<DaemonClient, "fetchAgentTimeline">;
type TimelinePage = FetchAgentTimelinePayload;
export type SessionPromptTimelineEntry = TimelinePage["entries"][number];

export interface SessionPromptPreviews {
  first: string | null;
  last: string | null;
}

export type SessionPromptTimelineClient = TimelineClient;

function normalizePromptPreview(text: string): string | null {
  if (SYSTEM_INJECTED_ENVELOPE.test(text)) return null;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 200 ? `${normalized.slice(0, 200)}…` : normalized;
}

function findFirstUserMessage(
  entries: readonly SessionPromptTimelineEntry[],
): SessionPromptTimelineEntry | null {
  return (
    entries.find(
      (entry) =>
        entry.item.type === "user_message" && normalizePromptPreview(entry.item.text) !== null,
    ) ?? null
  );
}

function findLastUserMessage(
  entries: readonly SessionPromptTimelineEntry[],
): SessionPromptTimelineEntry | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.item.type === "user_message" && normalizePromptPreview(entry.item.text) !== null) {
      return entry;
    }
  }
  return null;
}

function formatEntry(entry: SessionPromptTimelineEntry | null): string | null {
  if (!entry || entry.item.type !== "user_message") return null;
  return normalizePromptPreview(entry.item.text);
}

function isSameTimelineEntry(
  left: SessionPromptTimelineEntry,
  right: SessionPromptTimelineEntry,
): boolean {
  if (left.item.type !== "user_message" || right.item.type !== "user_message") return false;
  if (left.item.messageId && right.item.messageId) {
    return left.item.messageId === right.item.messageId;
  }
  return left.seqStart === right.seqStart && left.seqEnd === right.seqEnd;
}

/** Converts selected timeline entries into bounded display text. */
export function createSessionPromptPreviews(input: {
  firstEntry: SessionPromptTimelineEntry | null;
  lastEntry: SessionPromptTimelineEntry | null;
}): SessionPromptPreviews {
  const first = formatEntry(input.firstEntry);
  const last =
    input.firstEntry && input.lastEntry && isSameTimelineEntry(input.firstEntry, input.lastEntry)
      ? null
      : formatEntry(input.lastEntry);
  return { first, last };
}

/** Extracts the first and last visible user prompts from a timeline page. */
export function extractSessionPromptPreviews(
  entries: readonly SessionPromptTimelineEntry[],
): SessionPromptPreviews {
  return createSessionPromptPreviews({
    firstEntry: findFirstUserMessage(entries),
    lastEntry: findLastUserMessage(entries),
  });
}

async function fetchFirstUserMessage(
  client: SessionPromptTimelineClient,
  agentId: string,
): Promise<SessionPromptTimelineEntry | null> {
  let page = await fetchAgentTimelineOnce(client, agentId, {
    direction: "after",
    limit: FIRST_PAGE_LIMIT,
  });
  let entry = findFirstUserMessage(page.entries);
  for (
    let pageIndex = 0;
    !entry && page.hasNewer && pageIndex < MAX_ADDITIONAL_PAGES;
    pageIndex += 1
  ) {
    if (!page.endCursor) break;
    page = await fetchAgentTimelineOnce(client, agentId, {
      direction: "after",
      cursor: page.endCursor,
      limit: FIRST_PAGE_LIMIT,
    });
    entry = findFirstUserMessage(page.entries);
  }
  // The initial after request starts at history start; hasOlder=false confirms exhaustion.
  if (!entry && !page.hasOlder && !page.hasNewer) return null;
  return entry;
}

async function fetchLastUserMessage(
  client: SessionPromptTimelineClient,
  agentId: string,
): Promise<SessionPromptTimelineEntry | null> {
  let page = await fetchAgentTimelineOnce(client, agentId, {
    direction: "tail",
    limit: TAIL_PAGE_LIMIT,
  });
  let entry = findLastUserMessage(page.entries);
  for (
    let pageIndex = 0;
    !entry && page.hasOlder && pageIndex < MAX_ADDITIONAL_PAGES;
    pageIndex += 1
  ) {
    if (!page.startCursor) break;
    page = await fetchAgentTimelineOnce(client, agentId, {
      direction: "before",
      cursor: page.startCursor,
      limit: TAIL_PAGE_LIMIT,
    });
    entry = findLastUserMessage(page.entries);
  }
  return entry;
}

export async function loadSessionPromptPreviews(input: {
  serverId: string;
  agentId: string;
  getClient: (serverId: string) => SessionPromptTimelineClient | null;
}): Promise<SessionPromptPreviews> {
  try {
    const client = input.getClient(input.serverId);
    if (!client) return EMPTY_SESSION_PROMPT_PREVIEWS;
    const firstEntry = await fetchFirstUserMessage(client, input.agentId);
    const lastEntry = await fetchLastUserMessage(client, input.agentId);
    return createSessionPromptPreviews({ firstEntry, lastEntry });
  } catch {
    return EMPTY_SESSION_PROMPT_PREVIEWS;
  }
}

export function useSessionPromptPreviews(
  serverId: string | null | undefined,
  agentId: string | null | undefined,
): SessionPromptPreviews {
  const normalizedServerId = serverId?.trim() ?? "";
  const normalizedAgentId = agentId?.trim() ?? "";
  const query = useFetchQuery({
    queryKey: ["session-prompt-previews", normalizedServerId, normalizedAgentId],
    enabled: Boolean(normalizedServerId && normalizedAgentId),
    dataShape: "value",
    staleTimeMs: SESSION_PROMPT_PREVIEWS_STALE_TIME,
    queryFn: async () => {
      const { getHostRuntimeStore } = await import("@/runtime/host-runtime");
      return loadSessionPromptPreviews({
        serverId: normalizedServerId,
        agentId: normalizedAgentId,
        getClient: (targetServerId) => getHostRuntimeStore().getClient(targetServerId),
      });
    },
  });

  return query.data ?? EMPTY_SESSION_PROMPT_PREVIEWS;
}
