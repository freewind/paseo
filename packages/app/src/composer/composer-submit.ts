/**
 * composer 的发送入口按会话登记在这里：宿主只按键取用，不自己拼底层发送。
 * composer 把"只读"、"提交中"、"运行中排队"这三种判断都带好，调用方不需要再判断一次。
 */
type ComposerSubmitOutcome = "sent" | "queued" | "blocked";

interface ComposerSubmitOptions {
  /** 先把用户当前草稿发出去，再发 text。压缩上下文需要，普通快捷发送不需要。 */
  includeDraft?: boolean;
}

type ComposerSubmit = (text: string, options?: ComposerSubmitOptions) => ComposerSubmitOutcome;

export function composerSubmitKey(serverId: string, agentId: string): string {
  return `${serverId}\u0000${agentId}`;
}

const submits = new Map<string, ComposerSubmit>();

export function registerComposerSubmit(key: string, submit: ComposerSubmit): () => void {
  submits.set(key, submit);
  return () => {
    if (submits.get(key) === submit) {
      submits.delete(key);
    }
  };
}

/** 没有登记（composer 不在这份会话里）时返回 blocked，调用方据此不发也不提示成功。 */
export function submitComposerText(
  key: string,
  text: string,
  options?: ComposerSubmitOptions,
): ComposerSubmitOutcome {
  const submit = submits.get(key);
  return submit ? submit(text, options) : "blocked";
}
