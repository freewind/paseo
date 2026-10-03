import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, type GestureResponderEvent } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, Copy } from "lucide-react-native";
import { useTranslation } from "react-i18next";
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

/**
 * Copy action shared by the tool-call sheet header and the inline tool badge.
 * Shows a check for a moment after a successful copy; a press never reaches an
 * enclosing pressable (the badge row toggles its details on press).
 */
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
    <Pressable
      onPress={handlePress}
      style={styles.button}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={copied ? t("toolCallDetails.copied") : t("toolCallDetails.copy")}
      testID={testID}
    >
      <CopyGlyph copied={copied} size={size} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    padding: theme.spacing[2],
  },
}));
