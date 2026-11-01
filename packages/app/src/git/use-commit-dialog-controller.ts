import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSessionStore } from "@/stores/session-store";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { i18n } from "@/i18n/i18next";
import type { CommitDialogRequest } from "./commit-dialog-store";
import { openCommitDialogModel, type CommitDialogSnapshot } from "./commit-dialog-model";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 提交只用用户改过的信息，去掉首尾空白；空信息不提交。 */
export function readCommitMessage(snapshot: CommitDialogSnapshot): string {
  return snapshot.message.trim();
}

/**
 * 纯对话框模型与数据源之间的适配层：草稿每次打开只取一次，提交走共享 git actions store，
 * 状态与 query 失效都留在那里。组件只渲染和派发意图。
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
    const message = readCommitMessage(model.getSnapshot());
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
