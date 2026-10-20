import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { AgentMemosRail } from "./agent-memos-rail";

interface AgentMemosSheetProps {
  visible: boolean;
  serverId: string;
  agentId: string;
  onAppendToComposer: (text: string) => void;
  onClose: () => void;
}

/**
 * The compact entry's destination. It reuses the gutter rail rather than a second list: pressing a
 * memo appends it to the composer and closes the sheet, so the text lands where the user is about
 * to type, and the add button stays reachable from the sheet's own header.
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
    (text: string) => {
      onClose();
      onAppendToComposer(text);
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
        onAppendToComposer={handleAppendToComposer}
      />
    </AdaptiveModalSheet>
  );
}
