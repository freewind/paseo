import type { AttachmentMetadata, UserComposerAttachment } from "@/attachments/types";
import type { AttachmentUpdater } from "@/composer/draft/input-draft";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { ComposerTextSource } from "@/composer/text-source";

/** 回退后要放回输入框的内容：那条消息的文字与附件。 */
export interface RewindRestoreInput {
  text: string;
  images?: AttachmentMetadata[];
  attachments?: AgentAttachment[];
}

/**
 * 把被回退消息的附件转成 composer 能接收的附件。转录里回显的是规范化后的
 * AgentAttachment：图片原样映射；上传文件这一种能原样映射回 composer 的部分。
 * 其余六种（forge_change_request、forge_issue、github_pr、github_issue、text、
 * review）会被丢掉：转录里没有能还原成 composer 片段的信息，forge 那几种要
 * ForgeSearchItem，review 要 reviewDraftKey，硬转会发出错误的附件。所以带
 * 这类附件的消息回退后附件会变少，这是已知并接受的降级，不是漏改。
 */
export function attachmentsFromParts(input: {
  images?: AttachmentMetadata[];
  attachments?: AgentAttachment[];
}): UserComposerAttachment[] {
  const parts: UserComposerAttachment[] = [];
  for (const image of input.images ?? []) {
    parts.push({ kind: "image", metadata: image });
  }
  for (const attachment of input.attachments ?? []) {
    if (attachment.type === "uploaded_file") {
      parts.push({ kind: "file", attachment });
    }
  }
  return parts;
}

interface RewindComposerRestoreContextValue {
  completeRewind: (input: RewindRestoreInput) => void;
}

interface RewindComposerRestoreProviderProps {
  textSource: ComposerTextSource;
  setText: (text: string) => void;
  attachments: readonly UserComposerAttachment[];
  setAttachments: (updater: AttachmentUpdater) => void;
  onRewindComplete: () => void;
  children: ReactNode;
}

const RewindComposerRestoreContext = createContext<RewindComposerRestoreContextValue | null>(null);

export function restoreComposerTextIfEmpty(input: {
  currentText: string;
  rewoundText: string;
}): string {
  if (input.currentText.length > 0) {
    return input.currentText;
  }
  return input.rewoundText;
}

export function RewindComposerRestoreProvider({
  textSource,
  setText,
  attachments,
  setAttachments,
  onRewindComplete,
  children,
}: RewindComposerRestoreProviderProps) {
  const completeRewind = useCallback(
    (input: RewindRestoreInput) => {
      const currentText = textSource.getSnapshot();
      const nextText = restoreComposerTextIfEmpty({
        currentText: currentText,
        rewoundText: input.text,
      });
      if (nextText !== currentText) {
        setText(nextText);
      }
      // 与文字同一规则：输入框里已经有附件时不动它，免得覆盖用户刚放进去的东西。
      if (attachments.length === 0) {
        const restored = attachmentsFromParts({
          images: input.images,
          attachments: input.attachments,
        });
        if (restored.length > 0) {
          setAttachments(restored);
        }
      }
      onRewindComplete();
    },
    [attachments.length, onRewindComplete, setAttachments, setText, textSource],
  );

  const value = useMemo(() => ({ completeRewind }), [completeRewind]);

  return (
    <RewindComposerRestoreContext.Provider value={value}>
      {children}
    </RewindComposerRestoreContext.Provider>
  );
}

export function useRewindComposerRestore(): RewindComposerRestoreContextValue | null {
  return useContext(RewindComposerRestoreContext);
}
