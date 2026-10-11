import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { readAssistantCommentSelection } from "@/assistant-comment/selection";

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedCommentIcon = withUnistyles(MessageSquarePlus, mutedColorMapping);

interface MarkdownCommentableBlockProps {
  blockText: string;
  children: ReactNode;
}

/**
 * Long press opens a menu with one row: comment on the selected text, or on the whole block when
 * nothing is selected. Long press rather than the native text selection, because a custom
 * selection menu item needs iOS native code and Android's ActionMode has no extension point.
 *
 * The selection has to be read while the menu is opening: the page still owns it then, and a
 * right click or long press itself does not clear it. Reading it at render time would be the
 * selection of whatever opened the menu last.
 */
export function MarkdownCommentableBlock({ blockText, children }: MarkdownCommentableBlockProps) {
  const comment = useAssistantComment();
  const { t } = useTranslation();
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const captureSelection = useCallback(() => {
    setSelectedText(readAssistantCommentSelection());
  }, []);
  const handleSelect = useCallback(() => {
    comment?.requestComment(selectedText ?? blockText);
  }, [comment, blockText, selectedText]);
  const leading = useMemo(() => <ThemedCommentIcon size={ICON_SIZE.sm} />, []);

  if (!comment || blockText.trim().length === 0) {
    return children;
  }

  return (
    <ContextMenu compactMode="popover">
      <ContextMenuTrigger
        testID="markdown-comment-trigger"
        onLongPress={captureSelection}
        onContextMenu={captureSelection}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        sheetTitle={t("comment.menu.title")}
        width={152}
        minWidth={0}
        horizontalPadding={4}
        testID="assistant-comment-menu"
      >
        <ContextMenuItem leading={leading} onSelect={handleSelect} testID="markdown-comment-item">
          {selectedText ? t("comment.menu.itemSelected") : t("comment.menu.item")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
