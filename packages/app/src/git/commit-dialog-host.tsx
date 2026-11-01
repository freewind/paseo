import { CommitDialog } from "./commit-dialog";
import { useCommitDialogStore } from "./commit-dialog-store";

/**
 * 应用级挂载点：凡是能触发提交的地方（Explorer、diff 面板、聊天面板）都要打开它，
 * 所以只挂一次在根布局，而不是挂在可能已经不存在的 pane 里。关闭时 request 变 null，
 * 组件卸载；下次打开重新挂载拿到新草稿，key 只负责区分不同目标的请求。
 */
export function CommitDialogHost() {
  const request = useCommitDialogStore((state) => state.request);
  const close = useCommitDialogStore((state) => state.closeCommitDialog);

  if (!request) return null;
  return (
    <CommitDialog key={`${request.serverId}::${request.cwd}`} request={request} onClose={close} />
  );
}
