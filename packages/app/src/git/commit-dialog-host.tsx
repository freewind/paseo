import { CommitDialog } from "./commit-dialog";
import { useCommitDialogStore } from "./commit-dialog-store";

/**
 * App-level host: the commit dialog must open from anywhere a commit can be triggered (Explorer,
 * diff pane, chat panel), so it mounts once in the root layout instead of inside a pane that may
 * not be alive. The key gives every open a fresh dialog and a fresh draft.
 */
export function CommitDialogHost() {
  const request = useCommitDialogStore((state) => state.request);
  const close = useCommitDialogStore((state) => state.closeCommitDialog);

  if (!request) return null;
  return (
    <CommitDialog key={`${request.serverId}::${request.cwd}`} request={request} onClose={close} />
  );
}
