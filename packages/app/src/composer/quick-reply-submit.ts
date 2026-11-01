/**
 * 常用回复要按“发送按钮”那条路走，而发送逻辑活在 composer 内部。composer 把已经带好
 * 只读与提交中判断的入口登记在这里，宿主只按键取用，不自己拼底层发送。
 */
export type QuickReplySubmitOutcome = "sent" | "queued" | "blocked";

type QuickReplySubmit = (text: string) => QuickReplySubmitOutcome;

export function composerQuickReplyKey(serverId: string, agentId: string): string {
  return `${serverId}\u0000${agentId}`;
}

const submits = new Map<string, QuickReplySubmit>();

export function registerComposerQuickReplySubmit(
  key: string,
  submit: QuickReplySubmit,
): () => void {
  submits.set(key, submit);
  return () => {
    if (submits.get(key) === submit) {
      submits.delete(key);
    }
  };
}

/** 没有登记（composer 不在这份会话里）时返回 blocked，调用方据此不发也不提示成功。 */
export function submitQuickReply(key: string, text: string): QuickReplySubmitOutcome {
  const submit = submits.get(key);
  return submit ? submit(text) : "blocked";
}
