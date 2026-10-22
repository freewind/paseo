import { create } from "zustand";

/**
 * The settings sidebar's search query, kept outside the screen component.
 *
 * Picking a result navigates to a settings route, which remounts `SettingsScreen`. A
 * component-local query would reset on that navigation and drop the user back into the full
 * list, so the query lives here instead. It is deliberately not persisted: reopening settings
 * later should start from the normal, unfiltered list.
 */
interface SettingsSearchState {
  query: string;
  setQuery: (query: string) => void;
  clear: () => void;
}

export const useSettingsSearchStore = create<SettingsSearchState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
  clear: () => set({ query: "" }),
}));

/** The trimmed query, or an empty string when there is nothing to highlight for. */
export function useSettingsSearchQuery(): string {
  return useSettingsSearchStore((state) => state.query.trim());
}
