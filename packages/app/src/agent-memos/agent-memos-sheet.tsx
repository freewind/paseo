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
 * The compact entry's destination. It reuses the gutter rail rather than a second list: pressing a
 * memo appends it to the composer and closes the sheet, so the text lands where the user is about
 * to type. The sheet header owns the title, so the rail hides its own and keeps only the add button.
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
