/** 本地用户意图比异步取消和 provider 收尾更早到达。 */
const listeners = new Map<string, Set<(agentId: string) => void>>();

export function interruptConversationSpeech(serverId: string, agentId: string) {
  for (const listener of listeners.get(serverId) ?? []) listener(agentId);
}

export function observeSpeechInterruptions(serverId: string, listener: (agentId: string) => void) {
  let hostListeners = listeners.get(serverId);
  if (!hostListeners) {
    hostListeners = new Set();
    listeners.set(serverId, hostListeners);
  }
  hostListeners.add(listener);
  return () => {
    hostListeners.delete(listener);
    if (hostListeners.size === 0) listeners.delete(serverId);
  };
}
