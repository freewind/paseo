import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TextContextMenuItem } from "react-native-enriched-markdown";
import * as Clipboard from "expo-clipboard";
import { ClipboardList, Copy } from "lucide-react-native";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAssistantComment } from "@/assistant-comment/context";
import { readAssistantCommentSelection } from "@/assistant-comment/selection";
import { resolveCommentQuote } from "@/assistant-comment/selection-model";
import { ThemedCommentIcon } from "@/assistant-comment/icons";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { ICON_SIZE } from "@/styles/theme";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedMemoIcon = withUnistyles(ClipboardList, mutedColorMapping);
const ThemedCopyIcon = withUnistyles(Copy, mutedColorMapping);

/**
 * 一条回复的评论入口。原生把菜单项交给文本选择菜单（选中后出现），web 用右键菜单，
 * 两条路都只负责打开评论框；引用哪段文字在读选择时决定。
 */
export function useMarkdownCommentMenu(commentSource: string | undefined) {
  const comment = useAssistantComment();
  const { t } = useTranslation();
  const enabled = Boolean(comment && commentSource);

  const requestComment = useCallback(
    (selected: string | null) => {
      if (comment && commentSource) {
        comment.requestComment(resolveCommentQuote(selected, commentSource));
      }
    },
    [comment, commentSource],
  );

  const requestAddToMemo = comment?.requestAddToMemo;
  const addToMemo = useCallback(
    (selected: string | null) => {
      requestAddToMemo?.(resolveCommentQuote(selected, commentSource ?? ""));
    },
    [commentSource, requestAddToMemo],
  );
  // 复制原文，不经 resolveCommentQuote：引用格式是评论用的，复制要的是用户看到的那段字。
  const copy = useCallback(
    (selected: string | null) => {
      const text = selected ?? commentSource;
      if (text) void Clipboard.setStringAsync(text);
    },
    [commentSource],
  );
  const nativeItems = useMemo<TextContextMenuItem[] | undefined>(() => {
    if (!enabled) return undefined;
    const items: TextContextMenuItem[] = [
      {
        text: t("comment.menu.item"),
        // 选择菜单自己带了选中文字；仍先问原生模块，超时或老二进制时退回事件里的值。
        onPress: ({ text }) => requestComment(readAssistantCommentSelection() ?? text),
      },
    ];
    if (requestAddToMemo) {
      items.push({
        text: t("comment.menu.addToMemo"),
        onPress: ({ text }) => addToMemo(readAssistantCommentSelection() ?? text),
      });
    }
    items.push({
      text: t("comment.menu.copy"),
      onPress: ({ text }) => copy(readAssistantCommentSelection() ?? text),
    });
    return items;
  }, [addToMemo, copy, enabled, requestAddToMemo, requestComment, t]);

  return { enabled, requestComment, addToMemo, copy, nativeItems };
}

/** web 右键菜单：`contextOnly` 只接右键，不影响文本选择与点击。 */
export function WebMarkdownCommentMenu({
  enabled,
  onComment,
  onAddToMemo,
  onCopy,
  children,
}: {
  enabled: boolean;
  onComment: (selected: string | null) => void;
  onAddToMemo?: (selected: string | null) => void;
  onCopy: (selected: string | null) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const leading = useMemo(() => <ThemedCommentIcon size={ICON_SIZE.sm} />, []);
  const memoLeading = useMemo(() => <ThemedMemoIcon size={ICON_SIZE.sm} />, []);
  const copyLeading = useMemo(() => <ThemedCopyIcon size={ICON_SIZE.sm} />, []);
  // 右键打开时就把选区记下来：点菜单项时浏览器可能已经折叠选区，届时再读只剩整条消息。
  const [captured, setCaptured] = useState<string | null>(null);
  const handleAddToMemo = useCallback(() => onAddToMemo?.(captured), [captured, onAddToMemo]);
  const handleCopy = useCallback(() => onCopy(captured), [captured, onCopy]);
  const handleOpenChange = useCallback((open: boolean) => {
    if (open) {
      setCaptured(readAssistantCommentSelection());
    }
  }, []);
  const handleSelect = useCallback(() => onComment(captured), [captured, onComment]);
  if (!enabled) {
    return children;
  }
  return (
    <ContextMenu compactMode="popover" onOpenChange={handleOpenChange}>
      <ContextMenuTrigger contextOnly testID="assistant-comment-trigger">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        sheetTitle={t("comment.menu.title")}
        width={152}
        minWidth={0}
        horizontalPadding={4}
        testID="assistant-comment-menu"
      >
        <ContextMenuItem leading={leading} onSelect={handleSelect} testID="assistant-comment-item">
          {t("comment.menu.item")}
        </ContextMenuItem>
        {onAddToMemo ? (
          <ContextMenuItem
            leading={memoLeading}
            onSelect={handleAddToMemo}
            testID="assistant-comment-add-to-memo"
          >
            {t("comment.menu.addToMemo")}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem leading={copyLeading} onSelect={handleCopy} testID="assistant-comment-copy">
          {t("comment.menu.copy")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
