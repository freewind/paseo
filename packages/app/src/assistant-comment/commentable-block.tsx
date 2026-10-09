import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { MessageSquarePlus } from "lucide-react-native";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { useAssistantComment } from "@/assistant-comment/context";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedCommentIcon = withUnistyles(MessageSquarePlus, mutedColorMapping);

interface MarkdownCommentableBlockProps {
  blockText: string;
  children: ReactNode;
}

/**
 * Long press opens a menu with one row: comment on this block. Long press rather than the native
 * text selection, because a custom selection menu item needs iOS native code and Android's
 * ActionMode has no extension point — the block is the unit both platforms can offer.
 */
export function MarkdownCommentableBlock({ blockText, children }: MarkdownCommentableBlockProps) {
  const comment = useAssistantComment();
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    comment?.requestComment(blockText);
  }, [comment, blockText]);
  const leading = useMemo(() => <ThemedCommentIcon size={ICON_SIZE.sm} />, []);

  if (!comment || blockText.trim().length === 0) {
    return children;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent sheetTitle={t("comment.menu.title")}>
        <ContextMenuItem leading={leading} onSelect={handleSelect} testID="markdown-comment-item">
          {t("comment.menu.item")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
