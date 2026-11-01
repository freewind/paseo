import type { AgentTimelineRow } from "./agent-timeline-store-types.js";

/**
 * 导出用的整段时间线：持久化的已提交行在前，内存里还没落盘的行补在后面。
 *
 * 只取 seq 大于持久层最大值的内存行：内存里通常包含持久层的同一批行（会话加载时回放），
 * 直接拼接会让同一个 seq 出现两次。按 seq 去重并升序，导出的顺序才与 stream 一致。
 */
export function mergeTimelineRowsForExport(input: {
  durableRows: readonly AgentTimelineRow[];
  liveRows: readonly AgentTimelineRow[];
}): AgentTimelineRow[] {
  const maxDurableSeq = input.durableRows.reduce((max, row) => Math.max(max, row.seq), 0);
  const rowsBySeq = new Map<number, AgentTimelineRow>();
  for (const row of input.durableRows) {
    rowsBySeq.set(row.seq, row);
  }
  for (const row of input.liveRows) {
    if (row.seq <= maxDurableSeq) continue;
    rowsBySeq.set(row.seq, row);
  }
  return [...rowsBySeq.values()].sort((left, right) => left.seq - right.seq);
}
