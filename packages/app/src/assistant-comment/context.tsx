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
  AssistantCommentSheet,
  type AssistantCommentRequest,
} from "@/assistant-comment/comment-sheet";

export interface AssistantCommentController {
  requestComment: (blockText: string) => void;
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
  onCommit: (input: { blockText: string; comment: string }) => void;
  children: ReactNode;
}

export function AssistantCommentProvider({ onCommit, children }: AssistantCommentProviderProps) {
  const [request, setRequest] = useState<AssistantCommentRequest | null>(null);
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
    (comment: string) => {
      setRequest((current) => {
        if (current) {
          onCommit({ blockText: current.blockText, comment });
        }
        return null;
      });
    },
    [onCommit],
  );

  const controller = useMemo(() => ({ requestComment }), [requestComment]);

  return (
    <AssistantCommentContext.Provider value={controller}>
      {children}
      <AssistantCommentSheet request={request} onCancel={cancelComment} onAttach={attachComment} />
    </AssistantCommentContext.Provider>
  );
}
