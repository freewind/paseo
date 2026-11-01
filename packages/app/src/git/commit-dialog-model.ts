export type CommitDraftFileStatus = "added" | "modified" | "deleted" | "renamed";

export interface CommitDraftFile {
  path: string;
  status: CommitDraftFileStatus;
  additions: number;
  deletions: number;
}

export interface CommitDraft {
  message: string;
  files: CommitDraftFile[];
  additions: number;
  deletions: number;
}

export type CommitDialogLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type CommitDialogSubmitState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

export interface CommitDialogSnapshot {
  load: CommitDialogLoadState;
  /** 非受控输入框的初始值；草稿落地后不再改写。 */
  initialMessage: string;
  /** 用户正在提交的信息，通过 onChangeText 同步。 */
  message: string;
  files: CommitDraftFile[];
  additions: number;
  deletions: number;
  submit: CommitDialogSubmitState;
  canSubmit: boolean;
}

const LOADING_SNAPSHOT: CommitDialogSnapshot = {
  load: { status: "loading" },
  initialMessage: "",
  message: "",
  files: [],
  additions: 0,
  deletions: 0,
  submit: { status: "idle" },
  canSubmit: false,
};

/**
 * 提交对话框的纯模型：草稿只到达一次，用户可改信息，提交是唯一离开对话框的命令。
 * 不 import React——组件只渲染快照并派发意图。
 */
export class CommitDialogModel {
  private snapshot: CommitDialogSnapshot = LOADING_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): CommitDialogSnapshot => this.snapshot;

  applyDraft(draft: CommitDraft): void {
    this.publish({
      load: { status: "ready" },
      initialMessage: draft.message,
      message: draft.message,
      files: draft.files,
      additions: draft.additions,
      deletions: draft.deletions,
      submit: { status: "idle" },
    });
  }

  failDraft(message: string): void {
    this.publish({ load: { status: "error", message } });
  }

  retry(): void {
    this.publish({ load: { status: "loading" }, submit: { status: "idle" } });
  }

  setMessage(message: string): void {
    this.publish({ message });
  }

  beginSubmit(): void {
    this.publish({ submit: { status: "pending" } });
  }

  failSubmit(message: string): void {
    this.publish({ submit: { status: "error", message } });
  }

  dispose(): void {
    this.listeners.clear();
  }

  private publish(patch: Partial<CommitDialogSnapshot>): void {
    const next: CommitDialogSnapshot = { ...this.snapshot, ...patch };
    const canSubmit =
      next.load.status === "ready" &&
      next.submit.status !== "pending" &&
      next.message.trim() !== "";
    if (
      next.load === this.snapshot.load &&
      next.initialMessage === this.snapshot.initialMessage &&
      next.message === this.snapshot.message &&
      next.files === this.snapshot.files &&
      next.additions === this.snapshot.additions &&
      next.deletions === this.snapshot.deletions &&
      next.submit === this.snapshot.submit &&
      canSubmit === this.snapshot.canSubmit
    ) {
      return;
    }
    this.snapshot = { ...next, canSubmit };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function openCommitDialogModel(): CommitDialogModel {
  return new CommitDialogModel();
}
