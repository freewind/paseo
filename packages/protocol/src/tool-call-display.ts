import type { ToolCallTimelineItem } from "./agent-types.js";
import { getPaseoToolLeafName, isPaseoToolName } from "./tool-name-normalization.js";
import { stripCwdPrefix } from "./path-utils.js";

export type ToolCallDisplayInput = Pick<
  ToolCallTimelineItem,
  "name" | "status" | "error" | "metadata" | "detail"
> & {
  cwd?: string;
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
  if (isPaseoToolName(trimmed)) {
    const leaf = getPaseoToolLeafName(trimmed);
    if (leaf) {
      return humanizeToolName(leaf);
    }
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

const TOOL_DISCOVERY_MCP_PREFIX = "mcp__tool_discovery__";

/**
 * Tool-discovery calls are three levels of noise on a phone: the MCP prefix, the vendor
 * name, and the action. The badge keeps `td_<action>` and only the argument the action is
 * about, so `td_execute codegraph_search_symbols` still says what ran.
 */
function buildToolDiscoveryDisplay(input: ToolCallDisplayInput): DetailDisplay | null {
  const normalized = input.name.trim().toLowerCase();
  if (!normalized.startsWith(TOOL_DISCOVERY_MCP_PREFIX)) return null;
  const action = normalized.slice(TOOL_DISCOVERY_MCP_PREFIX.length);
  const rawInput = input.detail.type === "unknown" ? input.detail.input : undefined;
  return {
    displayName: `td_${action}`,
    summary: readToolDiscoverySummary(action, rawInput),
  };
}

function readToolDiscoverySummary(action: string, rawInput: unknown): string | undefined {
  if (!isRecord(rawInput)) return undefined;
  if (action === "get") {
    const tools = rawInput.tools;
    if (!Array.isArray(tools)) return undefined;
    const names = tools
      .map((entry) => readString(entry))
      .filter((entry): entry is string => entry !== undefined);
    return names.length > 0 ? names.join(", ") : undefined;
  }
  if (action === "search") {
    return readString(rawInput.query);
  }
  if (action === "execute") {
    return readString(rawInput.tool);
  }
  return undefined;
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
  return {};
}

export function buildToolCallDisplayModel(input: ToolCallDisplayInput): ToolCallDisplayModel {
  const toolDiscoveryDisplay = buildToolDiscoveryDisplay(input);
  const canonicalDisplay = buildCanonicalDetailDisplay(input);
  const unknownDetailOverride = buildUnknownDetailOverride(input);
  const displayName =
    toolDiscoveryDisplay?.displayName ??
    unknownDetailOverride.displayName ??
    canonicalDisplay.displayName ??
    humanizeToolName(input.name);
  // A tool-discovery call never falls back to another summary source: whatever the action
  // does not name explicitly stays off the badge.
  const summary = toolDiscoveryDisplay
    ? toolDiscoveryDisplay.summary
    : (unknownDetailOverride.summary ?? canonicalDisplay.summary);
  const errorText = input.status === "failed" ? formatErrorText(input.error) : undefined;

  return {
    displayName,
    ...(summary ? { summary } : {}),
    ...(errorText ? { errorText } : {}),
  };
}
