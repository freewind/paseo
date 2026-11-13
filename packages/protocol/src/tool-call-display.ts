import type { ToolCallTimelineItem } from "./agent-types.js";
import {
  buildAgentMessageDisplay,
  buildPaseoToolDisplay,
} from "./paseo-tool-presentation/index.js";
import { formatSize } from "./format-size.js";
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
  isArgumentSummary?: boolean;
}

interface DetailDisplay {
  displayName?: string;
  summary?: string;
  isArgumentSummary?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 按 key 从工具参数里取一段可显示的值；数组最多拼两个，再多只留省略号。 */
function readSummaryValue(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item !== "");
    if (items.length === 0) {
      return undefined;
    }
    return items.length > 2 ? `${items[0]} | ${items[1]} | …` : items.join(" | ");
  }
  return readString(value);
}

/**
 * 给未映射的工具猜摘要时，按这张表的顺序取字段。
 * 这个顺序是按见过的工具归纳出来的，没有客观判据，想调整只能照着徽标里的实际显示效果试。
 * 没有这张表，搜索类工具只会显示目录，看起来像在说「这个工具要处理文件夹」。
 * `command` 故意不列进来：未映射工具的 input 是任意 JSON，出现 `command`
 * 不代表它在执行命令。
 *
 * 取哪个字段只看这张表的顺序，没有任何分支去认具体工具名：先取 `query`、`pattern`，
 * 再取符号类字段，然后是标题与 prompt；没见过的工具也能拿到最合适的两段。
 */
const UNKNOWN_INTENT_KEYS = [
  "query",
  "pattern",
  "patterns",
  "substring_pattern",
  "name_path_pattern",
  "name_path",
  "symbol",
  "symbolName",
  "symbol_name",
  "memory_name",
  "title",
  "url",
  "uri",
  "prompt",
  "initialPrompt",
  "message",
] as const;

const UNKNOWN_TARGET_KEYS = [
  "path",
  "relative_path",
  "filePath",
  "file_path",
  "file",
  "projectPath",
  "project_path",
  "cwd",
  "directory",
  "dir",
] as const;

function firstSummaryValue(
  input: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = readSummaryValue(input, key);
    if (value) return value;
  }
  return undefined;
}

/** 让徽标保持一行：否则带换行的 prompt 会把它撑开。 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 最多两段——先问什么，再指向哪里——无论命中多少键。徽标
 * 长到三四段就不再是一眼能读完的东西了。
 */
function buildUnknownInputSummary(input: unknown, cwd: string | undefined): string | undefined {
  if (!isRecord(input)) return undefined;
  const intent = firstSummaryValue(input, UNKNOWN_INTENT_KEYS);
  const target = firstSummaryValue(input, UNKNOWN_TARGET_KEYS);
  const intentText = intent ? collapseWhitespace(intent) : undefined;
  const targetText = target ? stripCwdPrefix(collapseWhitespace(target), cwd) : undefined;
  // 工具只说一次的主体不能显示两次，比如 `uri` 与同一个 `path`。
  if (intentText && targetText && intentText === targetText) return intentText;
  const parts = [intentText, targetText].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** 参数的 UTF-8 字节数：字符串直接数，其它先序列化。 */
function byteLengthOf(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return new TextEncoder().encode(text).length;
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
    case "show_diff":
      return buildFilePathDisplay("ShowDiff", input.detail.filePath, input.cwd);
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
      summary: formatSize(byteLengthOf(input.detail.input)),
    };
  }
  if (lowerName === "terminal") {
    return {
      displayName: "Terminal",
      summary: input.detail.type === "plain_text" ? readString(input.detail.label) : undefined,
    };
  }
  if (input.detail.type === "unknown") {
    const summary = buildUnknownInputSummary(input.detail.input, input.cwd);
    if (summary) {
      return { summary, isArgumentSummary: true };
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
    ...(unknownDetailOverride.isArgumentSummary ? { isArgumentSummary: true } : {}),
    ...(errorText ? { errorText } : {}),
  };
}
