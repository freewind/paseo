/**
 * Turn performance stats shown under a completed assistant reply, in the Freewind LLM
 * project's format: seconds keep one decimal, TPS is output tokens per total second.
 * Missing pieces are omitted rather than shown as zeros.
 */

export interface TurnStatsInput {
  ttftMs?: number | null;
  durationMs?: number | null;
  outputTokens?: number;
}

/** Milliseconds -> seconds with one decimal (1234 -> "1.2"). Display only. */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export function formatTurnStats(input: TurnStatsInput): string | null {
  const { ttftMs, durationMs, outputTokens } = input;
  if (durationMs === undefined || durationMs === null) {
    return null;
  }
  const parts: string[] = [];
  if (ttftMs !== undefined && ttftMs !== null) {
    parts.push(`ttft ${formatSeconds(ttftMs)}s`);
  }
  parts.push(`total ${formatSeconds(durationMs)}s`);
  if (outputTokens !== undefined && outputTokens !== null) {
    const tps = outputTokens / (durationMs / 1000);
    parts.push(`tps ${tps.toFixed(1)}`);
    parts.push(`${outputTokens} tokens`);
  }
  return parts.join(" · ");
}
