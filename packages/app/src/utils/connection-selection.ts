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
   * 首选连接。只要它还在候选里就直接用它，不看探测结果：一条死连接也死守它，用户得自己去换。
   * 指向已删连接时回退到按延迟挑。
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
  if (preferred && candidates.some((candidate) => candidate.connectionId === preferred)) {
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
