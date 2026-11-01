import type { HostConnection } from "@/types/host-connection";

export interface ConnectionCandidate {
  connectionId: string;
  connection: HostConnection;
}

export type ConnectionProbeState =
  | { status: "pending"; latencyMs: null }
  | { status: "unavailable"; latencyMs: null }
  | { status: "available"; latencyMs: number };

export interface SelectBestConnectionInput {
  candidates: ConnectionCandidate[];
  probeByConnectionId: Map<string, ConnectionProbeState>;
  /**
   * 用户手动选定的连接。可达就直接用它；没选、选的不是候选、或选的不可达，一律退回最低
   * 延迟，免得一个死连接把应用困在连不上的状态。
   */
  preferredConnectionId?: string | null;
}

function getAvailableLatency(input: {
  connectionId: string;
  probeByConnectionId: Map<string, ConnectionProbeState>;
}): number | null {
  const probe = input.probeByConnectionId.get(input.connectionId);
  return probe?.status === "available" ? probe.latencyMs : null;
}

export function selectBestConnection(input: SelectBestConnectionInput): string | null {
  const { candidates, probeByConnectionId } = input;
  if (candidates.length === 0) {
    return null;
  }

  const preferred = input.preferredConnectionId;
  if (
    preferred &&
    candidates.some((candidate) => candidate.connectionId === preferred) &&
    getAvailableLatency({ connectionId: preferred, probeByConnectionId }) !== null
  ) {
    return preferred;
  }

  let bestConnectionId: string | null = null;
  let bestLatency: number | null = null;

  for (const candidate of candidates) {
    const latencyMs = getAvailableLatency({
      connectionId: candidate.connectionId,
      probeByConnectionId,
    });
    if (latencyMs === null) {
      continue;
    }
    if (bestLatency === null || latencyMs < bestLatency) {
      bestConnectionId = candidate.connectionId;
      bestLatency = latencyMs;
    }
  }

  return bestConnectionId;
}
