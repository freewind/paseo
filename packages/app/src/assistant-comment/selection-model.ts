/** 去掉首尾空白；空串与读不到归一成 `null`，调用方只需判断一种“没有选择”。 */
export function normalizeSelection(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 原生读取的适配层：模块超时、老二进制里没有模块、或模块自身抛错，都归一成 `null`，
 * 让评论框回落到整条消息，而不是把异常抛到手势回调里。
 */
export function createSelectionReader(read: () => string | null | undefined): () => string | null {
  return () => {
    try {
      return normalizeSelection(read());
    } catch {
      return null;
    }
  };
}

/** 有选中就引用选中的那几句，没有就引用整条回复。 */
export function resolveCommentQuote(selected: string | null, source: string): string {
  return selected ?? source;
}
