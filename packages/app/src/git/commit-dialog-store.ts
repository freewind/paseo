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
 * 提交以前直接在按钮里发生。现在只有对话框能提交，它挂在应用级，Explorer、diff 面板、
 * 聊天面板都能打开它，而打开它的 pane 可能已经销毁。
 */
export const useCommitDialogStore = create<CommitDialogStoreState>((set) => ({
  request: null,
  openCommitDialog: (request) => set({ request }),
  closeCommitDialog: () => set({ request: null }),
}));
