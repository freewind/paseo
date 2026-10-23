import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSessionStore } from "@/stores/session-store";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { i18n } from "@/i18n/i18next";
import type { CommitDialogRequest } from "./commit-dialog-store";
import { openCommitDialogModel, type CommitDialogSnapshot } from "./commit-dialog-model";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Adapter between the plain dialog model and its data sources: the draft comes from the daemon once
 * per open, submit goes through the shared git actions store so status and query invalidation stay
 * in one place. The component only renders and dispatches.
 */
export function useCommitDialogController({
  serverId,
  cwd,
  onSubmitted,
}: CommitDialogRequest & { onSubmitted: () => void }): {
  snapshot: CommitDialogSnapshot;
  setMessage: (message: string) => void;
  retry: () => void;
  submit: () => void;
} {
  const [model] = useState(() => openCommitDialogModel());
  const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const runCommit = useCheckoutGitActionsStore((state) => state.commit);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const client = useSessionStore.getState().sessions[serverId]?.client ?? null;
    if (!client) {
      model.failDraft(i18n.t("common.errors.daemonClientUnavailable"));
      return;
    }
    void (async () => {
      try {
        const draft = await client.draftCheckoutCommit(cwd);
        if (cancelled) return;
        model.applyDraft({
          message: draft.message,
          files: draft.files,
          additions: draft.additions,
          deletions: draft.deletions,
        });
      } catch (error) {
        if (cancelled) return;
        model.failDraft(errorMessage(error, i18n.t("workspace.git.commitDialog.loadFailed")));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cwd, model, reloadToken, serverId]);

  useEffect(() => () => model.dispose(), [model]);

  const setMessage = useCallback(
    (message: string) => {
      model.setMessage(message);
    },
    [model],
  );

  const retry = useCallback(() => {
    model.retry();
    setReloadToken((token) => token + 1);
  }, [model]);

  const submit = useCallback(() => {
    const message = model.getSnapshot().message.trim();
    if (!message) return;
    model.beginSubmit();
    void runCommit({ serverId, cwd, message }).then(
      () => onSubmitted(),
      (error: unknown) => {
        model.failSubmit(errorMessage(error, i18n.t("workspace.git.actions.toasts.failedCommit")));
      },
    );
  }, [cwd, model, onSubmitted, runCommit, serverId]);

  return { snapshot, setMessage, retry, submit };
}
