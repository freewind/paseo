import { useCallback, useRef, useState } from "react";

const EMPTY_SET: Set<string> = new Set();

export interface UseCloseTabsResult {
  closingTabIds: Set<string>;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
}

/**
 * 同一个 tab 的关闭去重：已在关闭中时，后来的请求直接丢弃而不排队 —— 双击行上的关闭按钮，
 * 或一个既归档又关闭的菜单项，都不会执行两次。不同 tab 之间仍然并行。
 * pending 集合同时也是行上关闭转圈的渲染来源。
 */
export function useCloseTabs(): UseCloseTabsResult {
  const pendingRef = useRef(new Set<string>());
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(EMPTY_SET);

  const closeTab = useCallback(async (tabId: string, action: () => Promise<void>) => {
    const normalized = tabId.trim();
    if (!normalized || pendingRef.current.has(normalized)) {
      return;
    }
    pendingRef.current.add(normalized);
    setClosingTabIds(new Set(pendingRef.current));
    try {
      await action();
    } finally {
      pendingRef.current.delete(normalized);
      setClosingTabIds(new Set(pendingRef.current));
    }
  }, []);

  return { closingTabIds, closeTab };
}
