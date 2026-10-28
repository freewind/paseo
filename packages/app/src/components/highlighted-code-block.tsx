import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, WrapText } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { HighlightToken } from "@getpaseo/highlight";
import { isNative, isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { highlightToKeyedLines, type KeyedLine } from "@/utils/highlight-cache";
import {
  markdownCopyCodeBlockDataSet,
  markdownCopyDataSet,
  TRAILING_CODE_LINE_BREAKS,
} from "@/assistant-selection-copy/markup";

interface HighlightedCodeBlockProps {
  code: string;
  language: string | null | undefined;
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
}

// Fence info strings ("```ts", "```typescript", "```ts {1,3}") map to the
// extension-based parser table in @getpaseo/highlight. Aliases here only
// cover names that don't already match an extension key in parsers.ts.
const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  rust: "rs",
  golang: "go",
  "c++": "cpp",
  csharp: "cs",
  "c#": "cs",
  objc: "m",
  "objective-c": "m",
  markdown: "md",
  elixir: "ex",
};

function fenceLanguageToExtension(info: string | null | undefined): string | null {
  if (!info) return null;
  const first = info.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  const normalized = first.replace(/^\./, "");
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function stripTerminalFenceNewline(code: string): string {
  return code.endsWith("\n") ? code.slice(0, -1) : code;
}

export const HighlightedCodeBlock = React.memo(function HighlightedCodeBlock({
  code,
  language,
  inheritedStyles,
  textStyle,
}: HighlightedCodeBlockProps) {
  // Box styles (bg / padding / border / radius / margin) go on the wrapper View
  // so the absolute copy button positions relative to the visible code area,
  // not to a parent that includes the Text's own marginVertical.
  const { containerStyle, innerTextStyle } = useMemo(
    () => splitFenceStyle(inheritedStyles, textStyle),
    [inheritedStyles, textStyle],
  );
  const renderedCode = useMemo(() => stripTerminalFenceNewline(code), [code]);
  const copyDataSet = useMemo(
    () => ({ ...CODE_SURFACE_DATASET, ...markdownCopyCodeBlockDataSet(language) }),
    [language],
  );

  const keyedLines = useMemo<KeyedLine[] | null>(
    () => highlightToKeyedLines(renderedCode, fenceLanguageToExtension(language)),
    [renderedCode, language],
  );

  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const toggleWrap = useCallback(() => setWrapLines((current) => !current), []);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const controlsVisible = isHovered || isNative || isCompact;
  // Copy the code without its trailing blank lines. A fence body ends in a newline,
  // and ends in more than one when the author left a blank line before the closing
  // fence; pasting any of them into a terminal runs the last line.
  const getCode = useCallback(() => code.replace(TRAILING_CODE_LINE_BREAKS, ""), [code]);

  return (
    <View
      style={[containerStyle, styles.container]}
      dataSet={copyDataSet}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        {/* Default is no wrap: the inner horizontal scroll carries long lines, so indentation
            and column alignment survive on a phone-width screen. Wrapping is a per-block,
            ephemeral opt-in from the header toggle — it is never persisted. */}
        {wrapLines ? (
          <View style={styles.codeLines}>
            {keyedLines
              ? renderCodeLines(keyedLines, innerTextStyle)
              : renderPlainCodeLines(renderedCode, innerTextStyle)}
          </View>
        ) : (
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.horizontalContent}
          >
            <View style={styles.codeLines}>
              {keyedLines
                ? renderCodeLines(keyedLines, innerTextStyle)
                : renderPlainCodeLines(renderedCode, innerTextStyle)}
            </View>
          </ScrollView>
        )}
      </ScrollView>
      <CodeBlockControls
        visible={controlsVisible}
        wrapLines={wrapLines}
        onToggleWrap={toggleWrap}
        getCode={getCode}
      />
    </View>
  );
});

// 每行一个 <Text>：单个 <Text> 会按容器宽度折行，兄弟行不重排，缩进才保得住。
// 无高亮的兜底（未知语言、超大代码块）：同样一行一个 <Text>，
// 理由与高亮路径相同——单个 <Text> 会按容器宽度折行。
function renderPlainCodeLines(
  code: string,
  innerTextStyle: StyleProp<TextStyle>,
): React.ReactNode[] {
  let offset = 0;
  return code.split("\n").map((line) => {
    const key = `${offset}:${line.length}`;
    offset += line.length + 1;
    return (
      <Text key={key} style={innerTextStyle} dataSet={markdownCopyDataSet.code}>
        {line.length === 0 ? ZERO_WIDTH : line}
      </Text>
    );
  });
}

function renderCodeLines(
  keyedLines: KeyedLine[],
  innerTextStyle: StyleProp<TextStyle>,
): React.ReactNode[] {
  return keyedLines.map((line) => (
    <Text key={line.key} style={innerTextStyle} dataSet={markdownCopyDataSet.code}>
      {line.tokens.length === 0
        ? ZERO_WIDTH
        : line.tokens.map(({ key, token }) => (
            <TokenSpan key={`${line.key}-${key}`} token={token} />
          ))}
    </Text>
  ));
}

interface TokenSpanProps {
  token: HighlightToken;
}

const TokenSpan = React.memo(function TokenSpan({ token }: TokenSpanProps) {
  return (
    <Text style={token.style ? syntaxTokenStyleFor(token.style) : undefined}>{token.text}</Text>
  );
});

interface SplitStyles {
  containerStyle: StyleProp<ViewStyle>;
  innerTextStyle: StyleProp<TextStyle>;
}

const CONTAINER_BASE: ViewStyle = { position: "relative", overflow: "hidden" };
const ZERO_WIDTH = "\u200b";
const WEB_SELECTABLE: TextStyle = isWeb ? ({ userSelect: "text" } as TextStyle) : {};

function splitFenceStyle(inheritedStyles: TextStyle, textStyle: TextStyle): SplitStyles {
  const { fontFamily, fontSize, color, ...box } = textStyle;
  const textOnly: TextStyle = { ...WEB_SELECTABLE };
  if (fontFamily !== undefined) textOnly.fontFamily = fontFamily;
  if (fontSize !== undefined) textOnly.fontSize = fontSize;
  if (fontSize !== undefined) textOnly.lineHeight = Math.round(fontSize * 1.45);
  if (color !== undefined) textOnly.color = color;
  return {
    containerStyle: [box as ViewStyle, CONTAINER_BASE],
    innerTextStyle: [inheritedStyles, textOnly],
  };
}

interface CodeBlockControlsProps {
  getCode: () => string;
  visible: boolean;
  wrapLines: boolean;
  onToggleWrap: () => void;
}

const CodeBlockControls = React.memo(function CodeBlockControls({
  getCode,
  visible,
  wrapLines,
  onToggleWrap,
}: CodeBlockControlsProps) {
  return (
    <>
      <WrapToggleButton visible={visible} wrapLines={wrapLines} onToggle={onToggleWrap} />
      <CopyButton getCode={getCode} visible={visible} />
    </>
  );
});

const WrapToggleButton = React.memo(function WrapToggleButton({
  visible,
  wrapLines,
  onToggle,
}: {
  visible: boolean;
  wrapLines: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const visibilityStyle = visible
    ? copyButtonStyles.containerVisible
    : copyButtonStyles.containerHidden;
  const wrapperStyle = useMemo(
    () => [copyButtonStyles.container, visibilityStyle, wrapToggleStyles.wrapToggleOffset],
    [visibilityStyle],
  );
  const accessibilityState = useMemo(() => ({ checked: wrapLines }), [wrapLines]);
  return (
    <Pressable
      onPress={onToggle}
      style={wrapperStyle}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityRole="switch"
      accessibilityState={accessibilityState}
      accessibilityLabel={wrapLines ? t("codeBlock.disableWrap") : t("codeBlock.enableWrap")}
      hitSlop={8}
      dataSet={markdownCopyDataSet.ignore}
      testID="code-block-wrap-toggle"
    >
      {({ hovered }) => {
        const iconColor = hovered
          ? copyButtonStyles.iconHoveredColor.color
          : copyButtonStyles.iconColor.color;
        return <WrapText size={14} color={iconColor} />;
      }}
    </Pressable>
  );
});

interface CopyButtonProps {
  getCode: () => string;
  visible: boolean;
}

const COPIED_RESET_MS = 1500;

const CopyButton = React.memo(function CopyButton({ getCode, visible }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const handlePress = useCallback(async () => {
    const content = getCode();
    if (!content) return;
    await Clipboard.setStringAsync(content);
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => {
      setCopied(false);
      resetRef.current = null;
    }, COPIED_RESET_MS);
  }, [getCode]);

  const visibilityStyle = visible
    ? copyButtonStyles.containerVisible
    : copyButtonStyles.containerHidden;
  const wrapperStyle = useMemo(
    () => [copyButtonStyles.container, visibilityStyle],
    [visibilityStyle],
  );

  return (
    <Pressable
      onPress={handlePress}
      style={wrapperStyle}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityRole="button"
      accessibilityLabel={copied ? t("message.actions.copied") : t("message.actions.copyCode")}
      hitSlop={8}
      dataSet={markdownCopyDataSet.ignore}
    >
      {({ hovered }) => {
        const iconColor = hovered
          ? copyButtonStyles.iconHoveredColor.color
          : copyButtonStyles.iconColor.color;
        return copied ? (
          <Check size={14} color={iconColor} />
        ) : (
          <Copy size={14} color={iconColor} />
        );
      }}
    </Pressable>
  );
});

const styles = StyleSheet.create(() => ({
  container: {
    overflow: "hidden",
  },
  scroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexDirection: "column" as const,
  },
  horizontalContent: {
    flexDirection: "row" as const,
  },
  // `alignSelf: flex-start` 让代码块在横向滚动视图里保持自然宽度，
  // 行容器永不收缩，也就没有内容被挤回折行。
  codeLines: {
    alignSelf: "flex-start",
    flexShrink: 0,
    flexDirection: "column" as const,
  },
}));

const wrapToggleStyles = StyleSheet.create((theme) => ({
  wrapToggleOffset: {
    right: theme.spacing[8],
  },
}));

const copyButtonStyles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    padding: theme.spacing[1],
  },
  containerVisible: {
    opacity: 1,
  },
  containerHidden: {
    opacity: 0,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  iconHoveredColor: {
    color: theme.colors.foreground,
  },
}));
