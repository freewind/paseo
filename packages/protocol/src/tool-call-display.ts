import type { ToolCallTimelineItem } from "./agent-types.js";
import {
  buildAgentMessageDisplay,
  buildPaseoToolDisplay,
} from "./paseo-tool-presentation/index.js";
import { stripCwdPrefix } from "./path-utils.js";

export type ToolCallDisplayInput = Pick<
  ToolCallTimelineItem,
  "name" | "status" | "error" | "metadata" | "detail" | "agentMessage"
> & {
  cwd?: string;
  /** Title of the agent a Paseo call targets, when the caller knows it. */
  targetAgentTitle?: string;
};

export interface ToolCallDisplayModel {
  displayName: string;
  summary?: string;
  errorText?: string;
}

interface DetailDisplay {
  displayName?: string;
  summary?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function humanizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return name;
  }
  if (/[:./]/.test(trimmed) || trimmed.includes("__")) {
    return trimmed;
  }

  return trimmed
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter((segment) => segment.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function formatErrorText(error: unknown): string | undefined {
  if (error === null || error === undefined) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.content === "string") {
    return error.content;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function buildFilePathDisplay(
  displayName: string,
  filePath: string,
  cwd: string | undefined,
): DetailDisplay {
  return {
    displayName,
    summary: stripCwdPrefix(filePath, cwd),
  };
}

function buildCanonicalDetailDisplay(input: ToolCallDisplayInput): DetailDisplay {
  switch (input.detail.type) {
    case "shell":
      return {
        displayName: "Shell",
        summary: input.detail.command,
      };
    case "read":
      return buildFilePathDisplay("Read", input.detail.filePath, input.cwd);
    case "edit":
      return buildFilePathDisplay("Edit", input.detail.filePath, input.cwd);
    case "write":
      return buildFilePathDisplay("Write", input.detail.filePath, input.cwd);
    case "search":
      return {
        displayName: "Search",
        summary: input.detail.query,
      };
    case "fetch":
      return {
        displayName: "Fetch",
        summary: input.detail.url,
      };
    case "worktree_setup":
      return {
        displayName: "Worktree setup",
        summary: input.detail.branchName,
      };
    case "sub_agent":
      return {
        displayName: readString(input.detail.subAgentType) ?? "Task",
        summary: readString(input.detail.description),
      };
    case "plain_text":
      return {
        summary: input.detail.label,
      };
    case "plan":
      return {
        displayName: "Plan",
      };
    case "unknown":
      return {};
    default:
      throw new Error("unreachable");
  }
}

/**
 * What an unmapped tool is asking for, in the order the fields read best. MCP tools arrive as
 * unknown details carrying their raw arguments, so without this a search badge shows only its
 * directory and reads as if the call were about the folder rather than the query.
 *
 * `command` is deliberately absent: raw arguments are not a shell tool's contract, and an
 * unrelated field named `command` must not become the badge's summary.
 */
const UNKNOWN_INTENT_KEYS = [
  "query",
  "pattern",
  "patterns",
  "substring_pattern",
  "name_path_pattern",
  "name_path",
  "title",
  "url",
  "prompt",
] as const;

/** Where the call points, in the order providers spell it. */
const UNKNOWN_TARGET_KEYS = ["path", "relative_path", "projectPath", "cwd"] as const;

function readSummaryValue(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item !== "");
    if (items.length === 0) {
      return undefined;
    }
    // Two patterns already fill a badge line; the rest would only be cut off.
    return items.length > 2 ? `${items[0]} | ${items[1]} | …` : items.join(" | ");
  }
  return readString(value);
}

function firstSummaryValue(
  input: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = readSummaryValue(input, key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** Keeps the badge to one line: a prompt with newlines would otherwise take it over. */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildUnknownInputSummary(input: unknown, cwd: string | undefined): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const intent = firstSummaryValue(input, UNKNOWN_INTENT_KEYS);
  const target = firstSummaryValue(input, UNKNOWN_TARGET_KEYS);
  const parts = [
    intent ? collapseWhitespace(intent) : undefined,
    target ? stripCwdPrefix(collapseWhitespace(target), cwd) : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function buildUnknownDetailOverride(input: ToolCallDisplayInput): DetailDisplay {
  const lowerName = input.name.trim().toLowerCase();
  if (input.detail.type === "unknown" && lowerName === "task") {
    return {
      displayName: "Task",
      summary: isRecord(input.metadata) ? readString(input.metadata.subAgentActivity) : undefined,
    };
  }
  if (input.detail.type === "unknown" && lowerName === "thinking") {
    return {
      displayName: "Thinking",
    };
  }
  if (lowerName === "terminal") {
    return {
      displayName: "Terminal",
      summary: input.detail.type === "plain_text" ? readString(input.detail.label) : undefined,
    };
  }
  // A tool the daemon could not map still says what it asks for and where, so its badge gets a
  // one-line summary instead of nothing.
  if (input.detail.type === "unknown") {
    const summary = buildUnknownInputSummary(input.detail.input, input.cwd);
    if (summary) {
      return { summary };
    }
  }
  return {};
}

export function buildToolCallDisplayModel(input: ToolCallDisplayInput): ToolCallDisplayModel {
  const errorText = input.status === "failed" ? formatErrorText(input.error) : undefined;
  const paseoDisplay = input.agentMessage
    ? buildAgentMessageDisplay(input.agentMessage)
    : buildPaseoToolDisplay({
        toolName: input.name,
        detail: input.detail,
        targetAgentTitle: input.targetAgentTitle,
      });
  if (paseoDisplay) {
    return {
      displayName: paseoDisplay.displayName,
      ...(paseoDisplay.summary ? { summary: paseoDisplay.summary } : {}),
      ...(errorText ? { errorText } : {}),
    };
  }
  const canonicalDisplay = buildCanonicalDetailDisplay(input);
  const unknownDetailOverride = buildUnknownDetailOverride(input);
  const displayName =
    unknownDetailOverride.displayName ??
    canonicalDisplay.displayName ??
    humanizeToolName(input.name);
  const summary = unknownDetailOverride.summary ?? canonicalDisplay.summary;

  return {
    displayName,
    ...(summary ? { summary } : {}),
    ...(errorText ? { errorText } : {}),
  };
}
