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
   * 这次初始化产出的 provider 会话。后续调用只能在这个会话仍是活的时复用结果：
   * 关闭会换掉会话，把死运行时的结果交给下一个调用方正是聊天空白的原因。
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
  // 先把已经在跑的加载升级，再进下面的栅栏等它：历史读取在派发时会读这个标志，
  // 后来者仍能拿到流。
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
      // 恢复和历史读共用一次生命周期进入：关闭不能夹在中间，留下一个空运行时。
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
 * 只有当初始化产出的会话仍然活着时才复用 pending。`getAgent` 返回副本，
 * provider 会话才是能跨副本比较的身份。
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
 * 活着但历史没读完的运行时不能当作已加载的聊天返回。再走生命周期队列重试，
 * 恢复和关闭在那里排队。
 */
async function ensureHistoryReady(
  agentId: string,
  agent: ManagedAgent,
  deps: EnsureAgentLoadedDeps,
): Promise<ManagedAgent> {
  // 只有明确的 false 才表示还有一次读没完成；没有这个标志的旧快照或测试替身按已就绪处理。
  if (agent.historyPrimed !== false) return agent;
  await deps.agentManager.hydrateTimelineFromProvider(agentId, {
    broadcast: deps.broadcastTimeline === true,
  });
  return deps.agentManager.getAgent(agentId) ?? agent;
}
