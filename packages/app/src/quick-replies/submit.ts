import type { ToastApi } from "@/components/toast-host";
import type { AgentInputSubmitResult } from "@/composer/submit";

export interface SubmitQuickReplyInput {
  /** composer 当前文本，快捷回复接在它后面。 */
  currentText: string;
  replyText: string;
  submitNow: (text: string) => Promise<AgentInputSubmitResult>;
  toast: ToastApi;
  labels: {
    sent: string;
    queued: string;
    failed: string;
  };
}

/** 把快捷回复接到当前文本后发送一次，提示只在拿到真实结果后出现。 */
export function submitQuickReply({
  currentText,
  replyText,
  submitNow,
  toast,
  labels,
}: SubmitQuickReplyInput): void {
  const trimmed = currentText.trim();
  const combinedText = trimmed ? `${currentText.trimEnd()}\n${replyText}` : replyText;
  void submitNow(combinedText).then((result) => {
    if (result === "submitted") {
      toast.show(labels.sent, { variant: "success" });
    } else if (result === "queued") {
      toast.show(labels.queued);
    } else if (result === "failed") {
      toast.error(labels.failed);
    }
    return undefined;
  });
}
