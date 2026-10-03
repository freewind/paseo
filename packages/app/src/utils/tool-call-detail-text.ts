import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { buildPaseoToolDetailSections } from "@getpaseo/protocol/paseo-tool-call-detail";
import { buildLineDiff, parseUnifiedDiff } from "@/utils/tool-call-parsers";

export interface ToolCallInputField {
  label: string;
  value: string;
}

function pushInputField(
  fields: ToolCallInputField[],
  label: string,
  value: string | number | null | undefined,
): void {
  if (value === null || value === undefined || value === "") return;
  fields.push({ label, value: String(value) });
}

/**
 * Parameters the tool was invoked with. Rendered above the result so a detail panel
 * still explains what ran when the tool produced no body (e.g. an empty `read`).
 */
export function buildToolCallInputFields(detail: ToolCallDetail | undefined): ToolCallInputField[] {
  if (!detail) return [];
  const fields: ToolCallInputField[] = [];
  if (detail.type === "read") {
    pushInputField(fields, "path", detail.filePath);
    pushInputField(fields, "offset", detail.offset);
    pushInputField(fields, "limit", detail.limit);
    return fields;
  }
  if (detail.type === "write" || detail.type === "edit") {
    pushInputField(fields, "path", detail.filePath);
    return fields;
  }
  if (detail.type === "search") {
    pushInputField(fields, "query", detail.query);
    pushInputField(fields, "path", detail.path);
    pushInputField(fields, "glob", detail.glob);
    pushInputField(fields, "limit", detail.limit);
    return fields;
  }
  return fields;
}

export function serializeUnknownValue(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Diff text as the detail panel shows it: the raw unified diff when present, otherwise a line diff. */
function resolveEditDiffText(detail: {
  unifiedDiff?: string;
  oldString?: string;
  newString?: string;
}): string | null {
  const lines = detail.unifiedDiff
    ? parseUnifiedDiff(detail.unifiedDiff)
    : buildLineDiff(detail.oldString ?? "", detail.newString ?? "");
  if (lines.length === 0) return null;
  return lines.map((line) => line.content).join("\n");
}

function joinSearchBlocks(blocks: Array<string | undefined>): string | null {
  const kept = blocks.filter((block): block is string => Boolean(block));
  return kept.length > 0 ? kept.join("\n\n") : null;
}

/** Search results as the panel lists them: raw output, then matched files, web hits and annotations. */
function resolveSearchOutputText(detail: {
  content?: string;
  filePaths?: string[];
  webResults?: Array<{ title: string; url: string }>;
  annotations?: string[];
}): string | null {
  return joinSearchBlocks([
    detail.content,
    detail.filePaths?.join("\n"),
    detail.webResults?.map((entry) => `${entry.title}\n${entry.url}`).join("\n\n"),
    detail.annotations?.join("\n\n"),
  ]);
}

function resolveUnknownText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const serialized = serializeUnknownValue(value);
  return serialized.length > 0 ? serialized : null;
}

/** Input half of the copied text: the same parameters the panel shows, plus per-type extras. */
function resolveInputBody(detail: ToolCallDetail): string | null {
  const fields = buildToolCallInputFields(detail);
  switch (detail.type) {
    case "shell":
      pushInputField(fields, "command", detail.command);
      pushInputField(fields, "cwd", detail.cwd);
      break;
    case "fetch":
      pushInputField(fields, "url", detail.url);
      pushInputField(fields, "prompt", detail.prompt);
      break;
    case "worktree_setup":
      pushInputField(fields, "branchName", detail.branchName);
      pushInputField(fields, "worktreePath", detail.worktreePath);
      break;
    case "sub_agent":
      pushInputField(fields, "subAgentType", detail.subAgentType);
      pushInputField(fields, "description", detail.description);
      pushInputField(fields, "childSessionId", detail.childSessionId);
      break;
    case "plain_text":
      pushInputField(fields, "label", detail.label);
      break;
    case "unknown":
      return resolveUnknownText(detail.input);
    default:
      break;
  }
  if (fields.length === 0) return null;
  return fields.map((field) => `${field.label}: ${field.value}`).join("\n");
}

/** Output half of the copied text: whatever result the tool produced, omitted when there is none. */
function resolveOutputBody(detail: ToolCallDetail): string | null {
  switch (detail.type) {
    case "edit":
      return resolveEditDiffText(detail);
    case "search":
      return resolveSearchOutputText(detail);
    case "unknown":
      return resolveUnknownText(detail.output);
    case "shell":
      return detail.output ?? null;
    case "read":
    case "write":
      return detail.content ?? null;
    case "fetch":
      return detail.result ?? null;
    case "worktree_setup":
    case "sub_agent":
      return detail.log.length > 0 ? detail.log : null;
    case "plain_text":
    case "plan":
      return detail.text ?? null;
    default:
      return null;
  }
}

/**
 * Plain-text rendering of a tool call for the clipboard: parameters first, result second,
 * separated by a blank line and a section title. Empty halves are skipped, so a call with
 * neither yields an empty string and the caller can leave the copy action inert.
 */
export function buildToolCallDetailText(
  detail: ToolCallDetail | undefined,
  toolName?: string,
): string {
  if (!detail) return "";
  if (detail.type === "unknown" && toolName) {
    const paseoSections = buildPaseoToolDetailSections(toolName, detail.input, detail.output);
    if (paseoSections) {
      return paseoSections
        .map((section) =>
          section.kind === "prose"
            ? `${section.title}:\n${section.text}`
            : `${section.title}:\n${section.fields
                .map((field) => `${field.label}: ${field.value}`)
                .join("\n")}`,
        )
        .join("\n\n");
    }
  }
  const input = resolveInputBody(detail);
  const output = resolveOutputBody(detail);
  const blocks: string[] = [];
  if (input) blocks.push(`Input:\n${input}`);
  if (output) blocks.push(`Output:\n${output}`);
  return blocks.join("\n\n");
}
