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
   * The user's hand-picked connection. Reachable preferred wins outright; only an absent
   * or unreachable preferred falls back to lowest-latency selection, so a manual choice
   * never traps the app on a dead connection.
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
