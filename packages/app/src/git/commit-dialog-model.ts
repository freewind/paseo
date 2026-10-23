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
  /** Seed for the uncontrolled message input; never rewritten after the draft lands. */
  initialMessage: string;
  /** The message the user is submitting, kept in sync through onChangeText. */
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
 * Plain model for the commit dialog: the draft arrives once, the user may edit the message, and
 * submit is the only command that leaves the dialog. No React imports — the component renders the
 * snapshot and dispatches intent.
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
