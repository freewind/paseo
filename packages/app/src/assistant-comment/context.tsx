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

export interface AssistantCommentController {
  /** 打开评论框；`blockText` 是要引用进草稿的那段文字。 */
  requestComment: (blockText: string) => void;
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
  children: ReactNode;
}

/**
 * 评论入口的价值在于引用自带原文：选中几句就能带着它们一起发出去，不用先手动复制再粘贴
 * 回输入框。
 */
export function AssistantCommentProvider({ onCommit, children }: AssistantCommentProviderProps) {
  const [request, setRequest] = useState<CommentRequest | null>(null);
  const nextId = useRef(1);

  const requestComment = useCallback((blockText: string) => {
    if (blockText.trim().length === 0) {
      return;
    }
    const id = nextId.current;
    nextId.current += 1;
    setRequest({ id, blockText });
  }, []);

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
    }),
    [requestComment],
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
    </AssistantCommentContext.Provider>
  );
}
