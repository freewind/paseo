import { describe, expect, it } from "vitest";
import type {
  DaemonClient,
  FetchAgentTimelinePayload,
} from "@getpaseo/client/internal/daemon-client";
import {
  extractSessionPromptPreviews,
  loadSessionPromptPreviews,
  type SessionPromptTimelineClient,
  type SessionPromptTimelineEntry,
} from "./use-session-prompt-previews";

type FetchTimeline = DaemonClient["fetchAgentTimeline"];
type TimelineOptions = Parameters<FetchTimeline>[1];

function entry(seq: number, item: SessionPromptTimelineEntry["item"]): SessionPromptTimelineEntry {
  return {
    provider: "claude",
    item,
    timestamp: new Date(0).toISOString(),
    seqStart: seq,
    seqEnd: seq,
    sourceSeqRanges: [{ startSeq: seq, endSeq: seq }],
    collapsed: [],
  } as SessionPromptTimelineEntry;
}

function page(input: {
  entries?: SessionPromptTimelineEntry[];
  direction?: "after" | "tail" | "before";
  hasOlder?: boolean;
  hasNewer?: boolean;
  startSeq?: number;
  endSeq?: number;
}): FetchAgentTimelinePayload {
  const { entries = [], direction = "after", hasOlder = false, hasNewer = false } = input;
  const startSeq = input.startSeq ?? entries[0]?.seqStart;
  const endSeq = input.endSeq ?? entries.at(-1)?.seqEnd;
  const cursor = (seq: number | undefined) =>
    seq === undefined ? null : { epoch: "epoch-1", seq };
  return {
    requestId: "request",
    agentId: "agent-1",
    agent: null,
    direction,
    projection: "projected",
    epoch: "epoch-1",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: startSeq ?? 0, maxSeq: endSeq ?? 0, nextSeq: (endSeq ?? 0) + 1 },
    startCursor: cursor(startSeq),
    endCursor: cursor(endSeq),
    hasOlder,
    hasNewer,
    entries,
    error: null,
  };
}

function createClient(pages: FetchAgentTimelinePayload[]): {
  client: SessionPromptTimelineClient;
  requests: TimelineOptions[];
} {
  const requests: TimelineOptions[] = [];
  const client = {
    fetchAgentTimeline: (async (_agentId: string, options: TimelineOptions = {}) => {
      requests.push(options);
      const next = pages.shift();
      if (!next) throw new Error("No page configured");
      return next;
    }) as FetchTimeline,
  };
  return { client, requests };
}

const user = (text: string, messageId?: string) => ({
  type: "user_message" as const,
  text,
  ...(messageId ? { messageId } : {}),
});

describe("extractSessionPromptPreviews", () => {
  it("extracts the first and last visible user prompts and normalizes whitespace", () => {
    expect(
      extractSessionPromptPreviews([
        entry(1, { type: "assistant_message", text: "hello" }),
        entry(2, user("  first\n prompt  ", "first")),
        entry(3, { type: "reasoning", text: "thinking" }),
        entry(4, user("last\t prompt", "last")),
      ]),
    ).toEqual({ first: "first prompt", last: "last prompt" });
  });

  it("skips system envelopes and blank user messages", () => {
    expect(
      extractSessionPromptPreviews([
        entry(1, user("<paseo-system>\ninternal\n</paseo-system>")),
        entry(2, user(" \n\t ")),
        entry(3, user("visible")),
      ]),
    ).toEqual({ first: "visible", last: null });
  });

  it("truncates previews after 200 normalized characters", () => {
    const text = "a ".repeat(120);
    expect(extractSessionPromptPreviews([entry(1, user(text))]).first).toBe(`${"a ".repeat(100)}…`);
  });

  it("returns the same single prompt only as first", () => {
    const single = entry(1, user("one prompt", "same"));
    expect(extractSessionPromptPreviews([single])).toEqual({ first: "one prompt", last: null });
  });
});

describe("loadSessionPromptPreviews", () => {
  it("fetches first and tail pages and continues within the two-page bound", async () => {
    const { client, requests } = createClient([
      page({ entries: [entry(1, { type: "assistant_message", text: "start" })], hasNewer: true }),
      page({ entries: [entry(101, user("first", "first"))], hasOlder: true, hasNewer: true }),
      page({
        direction: "tail",
        entries: [entry(500, { type: "assistant_message", text: "end" })],
        hasOlder: true,
      }),
      page({ direction: "before", entries: [entry(499, user("last", "last"))], hasOlder: true }),
    ]);

    const result = await loadSessionPromptPreviews({
      serverId: "server-1",
      agentId: "agent-1",
      getClient: () => client,
    });

    expect(result).toEqual({ first: "first", last: "last" });
    expect(requests).toEqual([
      { direction: "after", limit: 100 },
      { direction: "after", cursor: { epoch: "epoch-1", seq: 1 }, limit: 100 },
      { direction: "tail", limit: 200 },
      { direction: "before", cursor: { epoch: "epoch-1", seq: 500 }, limit: 200 },
    ]);
  });

  it("stops after two additional pages in either direction", async () => {
    const emptyNewer = () =>
      page({
        entries: [entry(1, { type: "assistant_message", text: "not a prompt" })],
        hasNewer: true,
      });
    const emptyOlder = () =>
      page({
        direction: "before",
        entries: [entry(1, { type: "assistant_message", text: "not a prompt" })],
        hasOlder: true,
      });
    const { client, requests } = createClient([
      emptyNewer(),
      emptyNewer(),
      emptyNewer(),
      page({
        direction: "tail",
        entries: [entry(1, { type: "assistant_message", text: "none" })],
        hasOlder: true,
      }),
      emptyOlder(),
      emptyOlder(),
    ]);

    await loadSessionPromptPreviews({
      serverId: "server-1",
      agentId: "agent-1",
      getClient: () => client,
    });

    expect(requests).toHaveLength(6);
  });

  it("returns an empty result when there is no client or a fetch fails", async () => {
    expect(
      await loadSessionPromptPreviews({
        serverId: "server-1",
        agentId: "agent-1",
        getClient: () => null,
      }),
    ).toEqual({ first: null, last: null });

    const failingClient = {
      fetchAgentTimeline: async () => {
        throw new Error("offline");
      },
    } as SessionPromptTimelineClient;
    await expect(
      loadSessionPromptPreviews({
        serverId: "server-1",
        agentId: "agent-1",
        getClient: () => failingClient,
      }),
    ).resolves.toEqual({ first: null, last: null });

    let calls = 0;
    const tailFailingClient = {
      fetchAgentTimeline: (async () => {
        calls += 1;
        if (calls === 1) return page({ entries: [entry(1, user("prompt", "first"))] });
        throw new Error("tail unavailable");
      }) as typeof failingClient.fetchAgentTimeline,
    } as SessionPromptTimelineClient;
    await expect(
      loadSessionPromptPreviews({
        serverId: "server-1",
        agentId: "agent-1",
        getClient: () => tailFailingClient,
      }),
    ).resolves.toEqual({ first: null, last: null });
  });
});
