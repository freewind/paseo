import { create } from "zustand";

export interface CommitDialogRequest {
  serverId: string;
  cwd: string;
}

interface CommitDialogStoreState {
  request: CommitDialogRequest | null;
  openCommitDialog: (request: CommitDialogRequest) => void;
  closeCommitDialog: () => void;
}

/**
 * Commit used to fire straight from the button. The dialog is the only place that commits now, and
 * it lives at app level so every entry point (Explorer, diff pane, chat panel) can open it.
 */
export const useCommitDialogStore = create<CommitDialogStoreState>((set) => ({
  request: null,
  openCommitDialog: (request) => set({ request }),
  closeCommitDialog: () => set({ request: null }),
}));
