import { describe, expect, test } from "vitest";
import type { AgentTaskSnapshotItem, AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import { buildConversationMarkdown } from "./conversation-markdown";

const toolCall: AgentTimelineItem = {
  type: "tool_call",
  callId: "call-1",
  name: "Read",
  status: "running",
  detail: { type: "read", filePath: "/tmp/example.ts" },
  error: null,
};

describe("buildConversationMarkdown", () => {
  test("keeps only user and assistant text as role sections, in order", () => {
    const items: AgentTimelineItem[] = [
      { type: "reasoning", text: "thinking about it" },
      { type: "user_message", text: "帮我看看这个报错" },
      toolCall,
      { type: "assistant_message", text: "原因是配置缺失" },
      { type: "error", message: "boom" },
      { type: "notification", level: "info", message: "noted" },
      { type: "todo", items: [] },
      { type: "compaction", status: "completed" },
      {
        type: "plugin",
        id: "p1",
        pluginId: "plugin",
        kind: "contribution",
        version: 1,
        data: null,
      },
      { type: "user_message", text: "谢谢" },
    ];

    expect(buildConversationMarkdown(items)).toBe(
      "## User\n\n帮我看看这个报错\n\n## Assistant\n\n原因是配置缺失\n\n## User\n\n谢谢",
    );
  });

  test("merges consecutive messages from the same role under one heading", () => {
    const items: AgentTimelineItem[] = [
      { type: "user_message", text: "第一段" },
      { type: "user_message", text: "第二段" },
      { type: "assistant_message", text: "回答一" },
      { type: "assistant_message", text: "回答二" },
    ];

    expect(buildConversationMarkdown(items)).toBe(
      "## User\n\n第一段\n\n第二段\n\n## Assistant\n\n回答一\n\n回答二",
    );
  });

  test("returns an empty string when no user or assistant text exists", () => {
    expect(buildConversationMarkdown([toolCall])).toBe("");
    expect(buildConversationMarkdown([])).toBe("");
  });

  test("opens with the agent title as plain text when one is given", () => {
    const items: AgentTimelineItem[] = [{ type: "user_message", text: "你好" }];

    expect(buildConversationMarkdown(items, undefined, { agentTitle: "修复登录跳转" })).toBe(
      "修复登录跳转\n\n## User\n\n你好",
    );
  });

  test("trims the title and skips empty titles without leaving a blank opener", () => {
    const items: AgentTimelineItem[] = [{ type: "user_message", text: "你好" }];

    expect(buildConversationMarkdown(items, undefined, { agentTitle: "   " })).toBe(
      "## User\n\n你好",
    );
    expect(buildConversationMarkdown(items, undefined, { agentTitle: null })).toBe(
      "## User\n\n你好",
    );
    expect(buildConversationMarkdown(items)).toBe("## User\n\n你好");
  });

  test("applies the title even to a tasks-only copy", () => {
    const tasks = [
      { id: 1, text: "ship it", completed: true, status: "completed", blockedBy: [] },
    ] as unknown as readonly AgentTaskSnapshotItem[];

    expect(buildConversationMarkdown([], tasks, { agentTitle: "Release" })).toBe(
      "Release\n\n## Tasks\n\n- [x] #1 ship it",
    );
  });
});
