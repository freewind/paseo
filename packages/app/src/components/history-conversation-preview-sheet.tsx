import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StatusBadge } from "@/components/ui/status-badge";
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
  /** 预览里点「打开」进入这条会话；不传时不显示该按钮。 */
  onOpen?: () => void;
}

interface HistoryConversationPreview {
  markdown: string;
  /** 会话里用户消息的条数；标题用它提示这条会话的体量。 */
  userMessageCount: number;
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
  onOpen,
}: HistoryConversationPreviewSheetProps) {
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  // The query key carries the agent, not the title, so read the title at call time instead of
  // re-fetching when the row's title changes underneath an open sheet.
  const agentTitleRef = useRef(agentTitle);
  agentTitleRef.current = agentTitle;

  const previewQuery = useFetchQuery({
    queryKey: [...HISTORY_PREVIEW_QUERY_ROOT, serverId, agentId],
    queryFn: async (): Promise<HistoryConversationPreview> => {
      if (!agentId) return { markdown: "", userMessageCount: 0 };
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      const payload = await client.exportAgentConversation(agentId);
      return {
        markdown: buildConversationMarkdown(
          payload.entries.map((entry) => entry.item),
          payload.tasks,
          { agentTitle: agentTitleRef.current },
        ),
        userMessageCount: payload.entries.filter((entry) => entry.item.type === "user_message")
          .length,
      };
    },
    enabled: visible && agentId !== null && client !== null,
    dataShape: "value",
    // A snapshot is good for a while; `useFetchQuery` rejects an infinite stale time, and five
    // minutes is long enough that reopening the same session reads the cache.
    staleTimeMs: 5 * 60_000,
  });
  const { refetch } = previewQuery;

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const header = useMemo<SheetHeader>(() => {
    const baseTitle = agentTitle ?? t("agentList.fallbackTitle");
    const userMessageCount = previewQuery.data?.userMessageCount;
    // 计数随会话数据一起返回；未返回前不显示徽章，避免先渲染一个错误的占位数字。
    return {
      title: baseTitle,
      leading:
        userMessageCount === undefined ? undefined : (
          <StatusBadge label={t("agentList.badges.userMessages", { count: userMessageCount })} />
        ),
      actions: onOpen ? (
        <Button
          variant="outline"
          size="sm"
          onPress={onOpen}
          testID="history-conversation-preview-open"
        >
          {t("common.actions.open")}
        </Button>
      ) : undefined,
    };
  }, [agentTitle, previewQuery.data?.userMessageCount, onOpen, t]);

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
  } else if (previewQuery.data?.markdown) {
    content = (
      <View style={styles.body}>
        <MarkdownRenderer text={previewQuery.data.markdown} />
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
      // 正文是整段会话的 Markdown，520 宽一行只放得下十来个字；放宽到 860 才像在读文档。
      desktopMaxWidth={860}
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
