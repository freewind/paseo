import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AssistantAnnotationSheet,
  type AssistantCommentRequest,
} from "@/assistant-comment/comment-sheet";
import { buildMemoText } from "@/assistant-comment/format";

export interface AssistantCommentController {
  requestComment: (blockText: string) => void;
  /**
   * Opens the memo sheet for the selection (or whole block). Absent when the host does not
   * support memos, and the menu hides the entry accordingly.
   */
  requestAddToTodo?: (blockText: string) => void;
}

const AssistantCommentContext = createContext<AssistantCommentController | null>(null);

/**
 * The long-press entry point for one markdown block, or null when the surrounding surface has no
 * composer to attach to. Blocks render plain when this is null.
 */
export function useAssistantComment(): AssistantCommentController | null {
  return useContext(AssistantCommentContext);
}

interface AssistantCommentProviderProps {
  onCommit: (input: { blockText: string; comment: string; sendNow: boolean }) => void;
  /** Present when the host supports memos; adds the selection to the memo list. */
  onAddToTodo?: (blockText: string) => void;
  children: ReactNode;
}

export function AssistantCommentProvider({
  onCommit,
  onAddToTodo,
  children,
}: AssistantCommentProviderProps) {
  const [request, setRequest] = useState<AssistantCommentRequest | null>(null);
  const [memoRequest, setMemoRequest] = useState<AssistantCommentRequest | null>(null);
  const nextId = useRef(1);

  const requestComment = useCallback((blockText: string) => {
    if (blockText.trim().length === 0) {
      return;
    }
    const id = nextId.current;
    nextId.current += 1;
    setRequest({ id, blockText });
  }, []);

  /** Opens the memo sheet; the memo is written only when the sheet is submitted. */
  const requestAddToMemo = useCallback(
    (blockText: string) => {
      if (!onAddToTodo || blockText.trim().length === 0) {
        return;
      }
      const id = nextId.current;
      nextId.current += 1;
      setMemoRequest({ id, blockText });
    },
    [onAddToTodo],
  );

  const cancelMemo = useCallback(() => {
    setMemoRequest(null);
  }, []);

  const submitMemo = useCallback(
    (comment: string) => {
      setMemoRequest((current) => {
        if (current) {
          onAddToTodo?.(buildMemoText({ blockText: current.blockText, comment }));
        }
        return null;
      });
    },
    [onAddToTodo],
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
      requestAddToTodo: onAddToTodo ? requestAddToMemo : undefined,
    }),
    [requestComment, requestAddToMemo, onAddToTodo],
  );

  return (
    <AssistantCommentContext.Provider value={controller}>
      {children}
      <AssistantAnnotationSheet
        variant="comment"
        request={request}
        onCancel={cancelComment}
        onSubmit={handleAttach}
        onSendNow={handleSend}
      />
      <AssistantAnnotationSheet
        variant="memo"
        request={memoRequest}
        onCancel={cancelMemo}
        onSubmit={submitMemo}
      />
    </AssistantCommentContext.Provider>
  );
}
