import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CommentSheet, type CommentRequest } from "@/assistant-comment/comment-sheet";
import { buildMemoText } from "@/assistant-comment/format";

export interface AssistantCommentController {
  /** 打开评论框；`blockText` 是要引用进草稿的那段文字。 */
  requestComment: (blockText: string) => void;
  /** 把选中的文字直接存成备忘；宿主不支持备忘时不存在。 */
  requestAddToMemo?: (blockText: string) => void;
}

const AssistantCommentContext = createContext<AssistantCommentController | null>(null);

/**
 * 当前 markdown 块可用的评论入口；外层没有 composer 可附加时返回 null，
 * 渲染方据此不显示评论菜单。
 */
export function useAssistantComment(): AssistantCommentController | null {
  return useContext(AssistantCommentContext);
}

interface AssistantCommentProviderProps {
  onCommit: (input: { blockText: string; comment: string; sendNow: boolean }) => void;
  /** 宿主支持备忘时提供；菜单里才会出现「添加到备忘」。 */
  onAddToMemo?: (blockText: string) => void;
  children: ReactNode;
}

export function AssistantCommentProvider({
  onCommit,
  onAddToMemo,
  children,
}: AssistantCommentProviderProps) {
  const [request, setRequest] = useState<CommentRequest | null>(null);
  const [memoRequest, setMemoRequest] = useState<CommentRequest | null>(null);
  const nextId = useRef(1);

  const requestComment = useCallback((blockText: string) => {
    if (blockText.trim().length === 0) {
      return;
    }
    const id = nextId.current;
    nextId.current += 1;
    setRequest({ id, blockText });
  }, []);

  /** 打开备忘弹层；只有提交时才真正写备忘。 */
  const openMemoSheet = useCallback(
    (blockText: string) => {
      if (!onAddToMemo || blockText.trim().length === 0) {
        return;
      }
      const id = nextId.current;
      nextId.current += 1;
      setMemoRequest({ id, blockText });
    },
    [onAddToMemo],
  );

  const cancelMemo = useCallback(() => {
    setMemoRequest(null);
  }, []);

  const submitMemo = useCallback(
    (comment: string) => {
      setMemoRequest((current) => {
        if (current) {
          onAddToMemo?.(buildMemoText({ blockText: current.blockText, comment }));
        }
        return null;
      });
    },
    [onAddToMemo],
  );

  const cancelComment = useCallback(() => {
    setRequest(null);
  }, []);

  const attachComment = useCallback(
    (comment: string, sendNow: boolean) => {
      setRequest((current) => {
        if (current) {
          onCommit({ blockText: current.blockText, comment, sendNow });
        }
        return null;
      });
    },
    [onCommit],
  );
  const handleAttach = useCallback(
    (comment: string) => attachComment(comment, false),
    [attachComment],
  );
  const handleSend = useCallback(
    (comment: string) => attachComment(comment, true),
    [attachComment],
  );

  const controller = useMemo<AssistantCommentController>(
    () => ({
      requestComment,
      requestAddToMemo: onAddToMemo ? openMemoSheet : undefined,
    }),
    [onAddToMemo, openMemoSheet, requestComment],
  );

  return (
    <AssistantCommentContext.Provider value={controller}>
      {children}
      <CommentSheet
        request={request}
        onCancel={cancelComment}
        onSubmit={handleAttach}
        onSendNow={handleSend}
      />
      <CommentSheet
        variant="memo"
        request={memoRequest}
        onCancel={cancelMemo}
        onSubmit={submitMemo}
      />
    </AssistantCommentContext.Provider>
  );
}
