import type { Logger } from "pino";

import type { AgentProvider, AgentSession } from "./agent-sdk-types.js";
import type { AgentManager, ManagedAgent } from "./agent-manager.js";
import type { AgentStorage } from "./agent-storage.js";
import {
  buildSessionConfig,
  isStoredAgentProviderAvailable,
  toAgentPersistenceHandle,
} from "../persistence-hooks.js";

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = "AgentNotFoundError";
  }
}

interface PendingAgentInitialization {
  promise: Promise<ManagedAgent>;
  options: { broadcastTimeline: boolean };
  /**
   * Provider session this initialization produced. A later caller may reuse the pending
   * result only while that session is still the live one: a close replaces the session, and
   * handing a dead runtime's result to the next caller is what left the chat blank.
   */
  session: { current: AgentSession | null };
}

const pendingAgentInitializations = new Map<string, PendingAgentInitialization>();

export type AgentLoaderManager = Pick<
  AgentManager,
  | "createAgent"
  | "getAgent"
  | "getRegisteredProviderIds"
  | "hydrateTimelineFromProvider"
  | "recoverAgentWithHistory"
  | "resumeAgentFromPersistence"
> &
  Partial<Pick<AgentManager, "waitForAgentClose">>;

export interface EnsureAgentLoadedDeps {
  agentManager: AgentLoaderManager;
  agentStorage: AgentStorage;
  validProviders?: Iterable<AgentProvider>;
  broadcastTimeline?: boolean;
  logger: Logger;
}

export async function ensureUnarchivedAgentLoaded(
  agentId: string,
  deps: EnsureAgentLoadedDeps & {
    agentManager: AgentLoaderManager & Pick<AgentManager, "closeAgent">;
  },
): Promise<ManagedAgent> {
  const record = await deps.agentStorage.get(agentId);
  if (record?.archivedAt) {
    throw new Error(`Agent is archived: ${agentId}`);
  }

  const agent = await ensureAgentLoaded(agentId, deps);
  const latestRecord = await deps.agentStorage.get(agentId);
  if (latestRecord?.archivedAt) {
    await deps.agentManager.closeAgent(agentId).catch((error: unknown) => {
      deps.logger.warn({ err: error, agentId }, "Failed to close concurrently archived agent");
    });
    throw new Error(`Agent is archived: ${agentId}`);
  }

  return agent;
}

export async function ensureAgentLoaded(
  agentId: string,
  deps: EnsureAgentLoadedDeps,
): Promise<ManagedAgent> {
  // Upgrade a load that is already running before the barrier below waits for it: the
  // hydration reads this flag when it dispatches, so a second caller still gets the stream.
  const running = pendingAgentInitializations.get(agentId);
  if (running) {
    running.options.broadcastTimeline ||= deps.broadcastTimeline === true;
  }

  await deps.agentManager.waitForAgentClose?.(agentId);

  const inflight = reusablePending(agentId, deps);
  if (inflight) {
    inflight.options.broadcastTimeline ||= deps.broadcastTimeline === true;
    return inflight.promise;
  }

  const existing = deps.agentManager.getAgent(agentId);
  if (existing) {
    return await ensureHistoryReady(agentId, existing, deps);
  }

  // A close may have started after the first barrier observed no in-flight
  // work. Once the live lookup is empty, this second barrier closes that gap
  // before storage-backed resume begins.
  await deps.agentManager.waitForAgentClose?.(agentId);

  const laterInflight = reusablePending(agentId, deps);
  if (laterInflight) {
    laterInflight.options.broadcastTimeline ||= deps.broadcastTimeline === true;
    return laterInflight.promise;
  }

  const pendingOptions = {
    broadcastTimeline: deps.broadcastTimeline === true,
  };
  const pendingSession: { current: AgentSession | null } = { current: null };
  const initPromise = (async () => {
    const record = await deps.agentStorage.get(agentId);
    if (!record) {
      throw new AgentNotFoundError(agentId);
    }

    const validProviders = deps.validProviders ?? deps.agentManager.getRegisteredProviderIds();
    if (!isStoredAgentProviderAvailable(record, validProviders)) {
      throw new Error(`Agent ${agentId} references unavailable provider '${record.provider}'`);
    }

    const handle = toAgentPersistenceHandle(validProviders, record.persistence);

    let snapshot: ManagedAgent;
    if (handle) {
      // Resume and the history read share one lifecycle entry: a close cannot land between
      // them and leave this caller with a blank runtime.
      snapshot = await deps.agentManager.recoverAgentWithHistory(agentId, {
        resumeWhenMissing: true,
        broadcastTimeline: () => pendingOptions.broadcastTimeline,
      });
      pendingSession.current = deps.agentManager.getAgent(agentId)?.session ?? null;
      deps.logger.info({ agentId, provider: record.provider }, "Agent resumed from persistence");
    } else {
      // No provider handle to resume: this starts the agent's first session rather than
      // bringing one back, so it stamps activity and carries no stored attention. Records
      // without a handle never got far enough to accumulate either.
      const config = buildSessionConfig(record, {
        validProviders,
      });
      if (!config) {
        throw new Error(`Agent ${agentId} references unavailable provider '${record.provider}'`);
      }
      snapshot = await deps.agentManager.createAgent(config, agentId, {
        labels: record.labels,
        workspaceId: record.workspaceId,
        owner: record.owner,
      });
      pendingSession.current = deps.agentManager.getAgent(agentId)?.session ?? null;
      await deps.agentManager.hydrateTimelineFromProvider(agentId, {
        broadcast: () => pendingOptions.broadcastTimeline,
      });
      deps.logger.info({ agentId, provider: record.provider }, "Agent created from stored config");
    }

    return deps.agentManager.getAgent(agentId) ?? snapshot;
  })();

  const pending: PendingAgentInitialization = {
    promise: initPromise,
    options: pendingOptions,
    session: pendingSession,
  };
  pendingAgentInitializations.set(agentId, pending);

  try {
    return await initPromise;
  } finally {
    const current = pendingAgentInitializations.get(agentId);
    if (current === pending) {
      pendingAgentInitializations.delete(agentId);
    }
  }
}

/**
 * Returns the pending initialization only while the session it produced is still live.
 * `getAgent` hands back a copy, so the provider session is the identity that survives.
 */
function reusablePending(
  agentId: string,
  deps: EnsureAgentLoadedDeps,
): PendingAgentInitialization | null {
  const pending = pendingAgentInitializations.get(agentId);
  if (!pending) return null;
  const session = pending.session.current;
  if (!session) return pending;
  return deps.agentManager.getAgent(agentId)?.session === session ? pending : null;
}

/**
 * A live runtime whose history never finished reading must not be handed back as a loaded
 * chat. Retry through the lifecycle lane, which is where resume and close are ordered.
 */
async function ensureHistoryReady(
  agentId: string,
  agent: ManagedAgent,
  deps: EnsureAgentLoadedDeps,
): Promise<ManagedAgent> {
  // Only an explicit false means a read is outstanding; an agent without the flag (older
  // snapshots, test doubles) is treated as ready rather than hydrating on every call.
  if (agent.historyPrimed !== false) return agent;
  await deps.agentManager.hydrateTimelineFromProvider(agentId, {
    broadcast: deps.broadcastTimeline === true,
  });
  return deps.agentManager.getAgent(agentId) ?? agent;
}
