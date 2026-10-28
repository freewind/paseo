import { useCallback, useEffect, useRef, useState } from "react";
import type { GestureResponderEvent } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { Check, Copy } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { copyToClipboard } from "@/utils/copy-to-clipboard";

const COPIED_RESET_MS = 1500;

interface ThemedCopyGlyphProps {
  copied: boolean;
  size: number;
  color?: string;
}

function ThemedCopyGlyph({ copied, size, color }: ThemedCopyGlyphProps) {
  const Icon = copied ? Check : Copy;
  return <Icon size={size} color={color} />;
}

const CopyGlyph = withUnistyles(ThemedCopyGlyph, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

export interface CopyTextButtonProps {
  getText: () => string;
  size?: number;
  testID?: string;
}

/** 复制成功后短暂显示对勾；按下不穿透到外层可按下区域。 */
export function CopyTextButton({
  getText,
  size = 18,
  testID = "tool-call-copy-button",
}: CopyTextButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const handlePress = useCallback(
    async (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      const text = getText();
      if (!text) return;
      await copyToClipboard(text);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, COPIED_RESET_MS);
    },
    [getText],
  );

  return (
    <ToolbarButton
      label={copied ? t("toolCallDetails.copied") : t("toolCallDetails.copy")}
      onPress={handlePress}
      testID={testID}
    >
      <CopyGlyph copied={copied} size={size} />
    </ToolbarButton>
  );
}
