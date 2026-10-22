import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { buildConversationMarkdown } from "@/timeline/conversation-markdown";

const HISTORY_PREVIEW_QUERY_ROOT = ["history-conversation-preview"] as const;
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export interface HistoryConversationPreviewSheetProps {
  serverId: string;
  /** Null before the first open; the last agent is kept so the sheet keeps content while closing. */
  agentId: string | null;
  agentTitle: string | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * The whole conversation rendered as Markdown — the same text Copy Markdown produces. The export
 * runs on the daemon and merges its durable timeline with the live one, so an archived session
 * previews as completely as it copies.
 */
export function HistoryConversationPreviewSheet({
  serverId,
  agentId,
  agentTitle,
  visible,
  onClose,
}: HistoryConversationPreviewSheetProps) {
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  // The query key carries the agent, not the title, so read the title at call time instead of
  // re-fetching when the row's title changes underneath an open sheet.
  const agentTitleRef = useRef(agentTitle);
  agentTitleRef.current = agentTitle;

  const previewQuery = useFetchQuery({
    queryKey: [...HISTORY_PREVIEW_QUERY_ROOT, serverId, agentId],
    queryFn: async (): Promise<string> => {
      if (!agentId) return "";
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      const payload = await client.exportAgentConversation(agentId);
      return buildConversationMarkdown(
        payload.entries.map((entry) => entry.item),
        payload.tasks,
        { agentTitle: agentTitleRef.current },
      );
    },
    enabled: visible && agentId !== null && client !== null,
    dataShape: "value",
    // The dialog is a snapshot: reopening the same session shows what was read last time.
    staleTimeMs: Number.POSITIVE_INFINITY,
  });
  const { refetch } = previewQuery;

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const header = useMemo<SheetHeader>(
    () => ({ title: agentTitle ?? t("agentList.fallbackTitle") }),
    [agentTitle, t],
  );

  const errorMessage =
    previewQuery.error instanceof Error ? previewQuery.error.message : t("common.errors.error");

  let content: ReactNode;
  if (previewQuery.isLoading) {
    content = (
      <View style={styles.centered}>
        <ThemedLoadingSpinner size="large" uniProps={mutedColorMapping} />
      </View>
    );
  } else if (previewQuery.isError) {
    content = (
      <View style={styles.centered}>
        <Alert
          size="md"
          variant="error"
          title={t("common.errors.error")}
          description={errorMessage}
        >
          <Button
            variant="outline"
            size="sm"
            onPress={handleRetry}
            testID="history-conversation-preview-retry"
          >
            {t("common.actions.retry")}
          </Button>
        </Alert>
      </View>
    );
  } else if (previewQuery.data) {
    content = (
      <View style={styles.body}>
        <MarkdownRenderer text={previewQuery.data} />
      </View>
    );
  } else {
    content = (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t("workspace.tabs.toasts.conversationMarkdownEmpty")}</Text>
      </View>
    );
  }

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      testID="history-conversation-preview"
    >
      {content}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
