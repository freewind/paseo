import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { AgentMemosRail } from "./agent-memos-rail";
import type { AgentMemo } from "@getpaseo/protocol/messages";

interface AgentMemosSheetProps {
  visible: boolean;
  serverId: string;
  agentId: string;
  onAppendToComposer: (memo: AgentMemo) => void;
  onClose: () => void;
}

/**
 * 紧凑入口的去处。复用右栏 rail 而不是另写一份列表：点一条备忘会追加到输入框并关掉
 * sheet，文字正好落在用户要输入的地方。sheet 头部已经有标题，rail 只留添加按钮。

 */
export function AgentMemosSheet({
  visible,
  serverId,
  agentId,
  onAppendToComposer,
  onClose,
}: AgentMemosSheetProps) {
  const { t } = useTranslation();
  const header = useMemo(() => ({ title: t("agentMemos.toggle") }), [t]);
  const handleAppendToComposer = useCallback(
    (memo: AgentMemo) => {
      onClose();
      onAppendToComposer(memo);
    },
    [onAppendToComposer, onClose],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      testID="agent-memos-sheet"
    >
      <AgentMemosRail
        serverId={serverId}
        agentId={agentId}
        compact
        showTitle={false}
        onAppendToComposer={handleAppendToComposer}
      />
    </AdaptiveModalSheet>
  );
}
