import { create } from "zustand";

/**
 * 设置侧栏的搜索词。放在 store 里而不是组件内 state：选中结果会跳到设置路由，
 * SettingsScreen 会重新挂载，组件内 state 一重置就把用户丢回完整列表。
 * 故意不做持久化——下次打开设置应该从正常列表开始。
 */
interface SettingsSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const useSettingsSearchStore = create<SettingsSearchState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));

/** 去掉首尾空白的搜索词；没有可高亮的内容时返回空串。 */
export function useSettingsSearchQuery(): string {
  return useSettingsSearchStore((state) => state.query.trim());
}
