import type { AgentMessage } from "@getpaseo/protocol/agent-message";
import { buildAgentMessageDisplay } from "@getpaseo/protocol/paseo-tool-presentation/index";
import type { PlanOutcome } from "@/components/plan-card";
import type { ComponentType } from "react";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { ToolCallDisplayInput } from "@/utils/tool-call-display";
import { buildToolCallDisplayModel } from "@/utils/tool-call-display";
import { extractToolCallFilePath } from "@/utils/extract-tool-call-file-path";
import {
  hasMeaningfulToolCallDetail,
  isPendingToolCallDetail,
} from "@/utils/tool-call-detail-state";

type ToolCallStatus = "executing" | "running" | "completed" | "failed" | "canceled";
export type ToolCallPresentationIcon = ComponentType<{ size?: number; color?: string }>;

interface BuildToolCallPresentationInput {
  agentMessage?: AgentMessage;
  toolName: string;
  status: ToolCallStatus;
  error: unknown;
  detail?: ToolCallDetail;
  cwd?: string;
  metadata?: Record<string, unknown>;
  targetAgentTitle?: string;
  resolveIcon: ToolCallIconResolver;
}

export interface ToolCallPresentation {
  detail: ToolCallDetail | undefined;
  displayName: string;
  summary?: string;
  /**
   * 当 `summary` 是未映射工具调用的原始参数 JSON 时为真。徽标用它
   * 来决定加分隔符，以及压掉那段 JSON 里的连续缩进。
   */
  isRawInputSummary: boolean;
  errorText?: string;
  icon: ToolCallPresentationIcon;
  isLoadingDetails: boolean;
  hasDetails: boolean;
  canOpenDetails: boolean;
  openFilePath: string | null;
  isPlan: boolean;
  planOutcome?: PlanOutcome;
}

export type ToolCallIconResolver = (
  toolName: string,
  detail: ToolCallDetail | undefined,
  agentMessage: AgentMessage | undefined,
) => ToolCallPresentationIcon;

function displayStatus(status: ToolCallStatus): ToolCallDisplayInput["status"] {
  return status === "executing" ? "running" : status;
}

/** 摘要只显示命令的第一个物理行；完整命令留在详情里。 */
function firstPhysicalLine(text: string): string {
  return text.split(/\r?\n/, 1)[0] ?? text;
}

function displayDetail(detail: ToolCallDetail | undefined): ToolCallDetail {
  return detail ?? { type: "unknown", input: null, output: null };
}

/**
 * 只显示标题：未知详情覆盖不带摘要，否则兜底链会把原始参数 JSON 露出来。
 */
function isThinkingToolName(name: string): boolean {
  return name.trim().toLowerCase() === "thinking";
}

export function buildToolCallPresentation(
  input: BuildToolCallPresentationInput,
): ToolCallPresentation {
  const detail = input.agentMessage
    ? buildAgentMessageDisplay(input.agentMessage).detail
    : input.detail;
  const detailForDisplay = displayDetail(detail);
  const displayModel = buildToolCallDisplayModel({
    name: input.toolName,
    agentMessage: input.agentMessage,
    status: displayStatus(input.status),
    error: input.error ?? null,
    detail: detailForDisplay,
    metadata: input.metadata,
    cwd: input.cwd,
    targetAgentTitle: input.targetAgentTitle,
  });
  let summary = displayModel.summary;
  if (isThinkingToolName(input.toolName)) {
    summary = undefined;
  } else if (detailForDisplay.type === "shell" && displayModel.summary) {
    summary = firstPhysicalLine(displayModel.summary);
  }
  const isLoadingDetails = isPendingToolCallDetail({
    detail,
    status: input.status,
    error: input.error,
  });
  const hasDetails = Boolean(input.error) || hasMeaningfulToolCallDetail(detail);

  return {
    detail,
    displayName: displayModel.displayName,
    summary,
    isRawInputSummary: displayModel.isArgumentSummary === true && Boolean(summary),
    errorText: displayModel.errorText,
    icon: input.resolveIcon(input.toolName, detail, input.agentMessage),
    isLoadingDetails,
    hasDetails,
    canOpenDetails: hasDetails || isLoadingDetails,
    openFilePath: extractToolCallFilePath(detail),
    isPlan: input.detail?.type === "plan",
    planOutcome: input.detail?.type === "plan" ? resolvePlanOutcome(input) : undefined,
  };
}

function resolvePlanOutcome(input: BuildToolCallPresentationInput): PlanOutcome | undefined {
  if (input.status === "canceled") return "canceled";
  if (input.metadata?.approved === false) return "rejected";
  if (input.metadata?.approved === true) return "approved";
  if (input.status === "running" || input.status === "executing") return "pending";
  return undefined;
}
