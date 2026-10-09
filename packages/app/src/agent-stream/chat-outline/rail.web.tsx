import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type PointerEvent as RNPointerEvent,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useReducedMotion } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useContainerWidth, useContainerWidthBelow } from "@/hooks/use-container-width";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { Button } from "@/components/ui/button";
import { baseColors, type Theme } from "@/styles/theme";
import { createChatOutlineHoverIntent } from "./hover-intent";
import { useChatOutlineCollapsed } from "./collapsed-state";
import {
  promptTickMagnification,
  resolveTextRailWidth,
  TEXT_ROW_LINE_HEIGHT,
  TEXT_ROW_MAX_HEIGHT,
  type ChatOutlinePrompt,
} from "./model";
import type { ChatOutlineRailProps } from "./rail";

// Hover tracking lives on the rail and the slots, never on the Pressable inside them:
// magnifying a slot must not move the box the pointer is resting on. See docs/hover.md.
const RAIL_WIDTH = 36;
const SLOT_HEIGHT = 8;
const MIN_PANEL_WIDTH = 918;
const RESTING_PILL_HEIGHT = 2;
const MAGNIFIED_PILL_HEIGHT = 4;
const RESTING_PILL_WIDTH = 10;
const ACTIVE_PILL_WIDTH = 18;
const MAGNIFIED_PILL_WIDTH = 26;
const PREVIEW_WIDTH = 260;
const PREVIEW_HEIGHT = 48;
const PREVIEW_GAP = 4;
// A text row has to be readable and clickable, not as dense as a dot.
const TEXT_ROW_MIN_HEIGHT = 24;

/**
 * The prompt the reader is inside is marked with color, not with a fill, so it never
 * competes with the transcript behind the rail. There is no semantic blue in the theme —
 * accent is green — so the raw scale is the only source of one. It is read from the module,
 * not from the style function's theme argument, which does not carry the raw scales.
 */
function activePromptColor(theme: Theme): string {
  return theme.colorScheme === "dark" ? baseColors.blue[400] : baseColors.blue[600];
}

export const ChatOutlineRail = memo(function ChatOutlineRail({
  prompts,
  activePrompt,
  onJumpToPrompt,
  variant,
  contentMaxWidth,
  agentId,
  onRequestPromptText,
}: ChatOutlineRailProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const prefersReducedMotion = useReducedMotion();
  const { onLayout: onLayoutWidth, width: panelWidth } = useContainerWidth();
  const { onLayout: onLayoutBelow, isBelow: isPanelNarrow } =
    useContainerWidthBelow(MIN_PANEL_WIDTH);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayoutWidth(event);
      onLayoutBelow(event);
    },
    [onLayoutBelow, onLayoutWidth],
  );

  const hoverIntent = useMemo(
    () =>
      createChatOutlineHoverIntent({
        activate: setHoveredIndex,
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: (timerId) => window.clearTimeout(timerId),
      }),
    [],
  );
  const handlePointerEnterTick = useCallback(
    (index: number) => hoverIntent.pointAt(index),
    [hoverIntent],
  );
  const handlePointerEnterRail = useCallback(
    (event: RNPointerEvent) => {
      hoverIntent.enter({ x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
    },
    [hoverIntent],
  );
  const handlePointerMoveRail = useCallback(
    (event: RNPointerEvent) => {
      hoverIntent.move({ x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
    },
    [hoverIntent],
  );
  const handlePointerLeaveRail = useCallback(() => hoverIntent.leave(), [hoverIntent]);
  useEffect(() => () => hoverIntent.dispose(), [hoverIntent]);
  useEffect(() => {
    if (isPanelNarrow) hoverIntent.leave();
  }, [hoverIntent, isPanelNarrow]);
  const handleFocusChange = useCallback((index: number, focused: boolean) => {
    setFocusedIndex((current) => {
      if (focused) return index;
      return current === index ? null : current;
    });
  }, []);

  // The pointer owns the magnified band while it is on the rail; keyboard focus drives the
  // same band and the same preview once the pointer leaves.
  const attentionIndex = hoveredIndex ?? focusedIndex;

  if (prompts.length < 2) return null;

  // The text outline rides the gutter on the right, beside the dots rather than
  // instead of them, so the two navigations never contend for the same edge.
  const textRailWidth =
    variant === "text" ? resolveTextRailWidth(panelWidth, contentMaxWidth) : null;

  if (isPanelNarrow) {
    return <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout} />;
  }

  return (
    <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout}>
      <View
        style={styles.rail}
        role="tablist"
        testID="chat-outline-rail"
        onPointerEnter={handlePointerEnterRail}
        onPointerMove={handlePointerMoveRail}
        onPointerLeave={handlePointerLeaveRail}
      >
        {prompts.map((prompt, index) => (
          <ChatOutlineTick
            key={prompt.seq}
            index={index}
            seq={prompt.seq}
            preview={prompt.preview}
            label={`${index + 1} of ${prompts.length}: ${prompt.preview}`}
            isActive={prompt.seq === activeSeq}
            hasAttention={index === attentionIndex}
            magnification={
              prefersReducedMotion || attentionIndex === null
                ? 0
                : promptTickMagnification(index - attentionIndex)
            }
            onHover={handlePointerEnterTick}
            onFocusChange={handleFocusChange}
            onJumpToPrompt={onJumpToPrompt}
            // The dot card repeats a truncated preview the text form already shows in
            // full, so the two forms never open a popover at the same time.
            showPreview={variant !== "text"}
          />
        ))}
      </View>
      {textRailWidth === null ? null : (
        <ChatOutlineTextRail
          // A different chat is a different outline, so it gets a fresh instance and
          // re-reads its own collapse rather than inheriting the previous chat's.
          key={agentId}
          prompts={prompts}
          activeSeq={activeSeq}
          width={textRailWidth}
          agentId={agentId}
          onHover={handlePointerEnterTick}
          onLeave={handlePointerLeaveRail}
          onFocusChange={handleFocusChange}
          onJumpToPrompt={onJumpToPrompt}
          onRequestPromptText={onRequestPromptText}
        />
      )}
    </View>
  );
});

interface ChatOutlineTickProps {
  index: number;
  seq: number;
  preview: string;
  label: string;
  isActive: boolean;
  hasAttention: boolean;
  /** False while the text form shows the prompt beside the dots. */
  showPreview: boolean;
  magnification: number;
  onHover: (index: number) => void;
  onFocusChange: (index: number, focused: boolean) => void;
  onJumpToPrompt: (seq: number) => void;
}

const ChatOutlineTick = memo(function ChatOutlineTick({
  index,
  seq,
  preview,
  label,
  isActive,
  hasAttention,
  showPreview,
  magnification,
  onHover,
  onFocusChange,
  onJumpToPrompt,
}: ChatOutlineTickProps) {
  const handlePress = useCallback(() => {
    onJumpToPrompt(seq);
    onFocusChange(index, false);
  }, [index, onFocusChange, onJumpToPrompt, seq]);
  const handlePointerEnter = useCallback(() => onHover(index), [index, onHover]);
  const handleFocus = useCallback(() => onFocusChange(index, true), [index, onFocusChange]);
  const handleBlur = useCallback(() => onFocusChange(index, false), [index, onFocusChange]);

  // The pill grows inside a slot that never moves, so magnification can never pull the hit
  // target out from under the pointer.
  const restingWidth = isActive ? ACTIVE_PILL_WIDTH : RESTING_PILL_WIDTH;
  const pillWidth = restingWidth + magnification * (MAGNIFIED_PILL_WIDTH - restingWidth);
  const pillHeight =
    RESTING_PILL_HEIGHT + magnification * (MAGNIFIED_PILL_HEIGHT - RESTING_PILL_HEIGHT);

  return (
    <View style={styles.slot} onPointerEnter={handlePointerEnter}>
      <Pressable
        style={styles.target}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole="tab"
        aria-selected={isActive}
        accessibilityLabel={label}
        testID={`chat-outline-tick-${seq}`}
      >
        <View
          style={[
            styles.pill,
            isActive && styles.pillActive,
            hasAttention && styles.pillAttention,
            inlineUnistylesStyle({ width: pillWidth, height: pillHeight }),
          ]}
        />
      </Pressable>
      {showPreview && hasAttention ? (
        <View style={styles.preview} pointerEvents="none" aria-hidden testID="chat-outline-preview">
          <Text style={styles.previewText} numberOfLines={2}>
            {preview}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

interface ChatOutlineTextRailProps {
  prompts: ChatOutlinePrompt[];
  activeSeq: number | null;
  width: number;
  agentId: string;
  onHover: (index: number) => void;
  onLeave: () => void;
  onFocusChange: (index: number, focused: boolean) => void;
  onJumpToPrompt: (seq: number) => void;
  onRequestPromptText: (seq: number) => Promise<string | null>;
}

const NO_PROMPT_TEXTS: ReadonlyMap<number, string> = new Map();

function mergePromptText(
  current: ReadonlyMap<number, string>,
  seq: number,
  text: string,
): ReadonlyMap<number, string> {
  if (current.get(seq) === text) return current;
  const next = new Map(current);
  next.set(seq, text);
  return next;
}

/**
 * Reads every prompt's full text in order. Serial on purpose: one reader at a time keeps a
 * long conversation from firing its whole backlog of reads at the daemon at once.
 */
async function readPromptTexts(
  prompts: readonly ChatOutlinePrompt[],
  read: (seq: number) => Promise<string | null>,
  onText: (seq: number, text: string) => void,
): Promise<void> {
  for (const prompt of prompts) {
    const text = await read(prompt.seq);
    if (text !== null) onText(prompt.seq, text);
  }
}

const ChatOutlineTextRail = memo(function ChatOutlineTextRail({
  prompts,
  activeSeq,
  width,
  agentId,
  onHover,
  onLeave,
  onFocusChange,
  onJumpToPrompt,
  onRequestPromptText,
}: ChatOutlineTextRailProps) {
  const [promptTexts, setPromptTexts] = useState<ReadonlyMap<number, string>>(NO_PROMPT_TEXTS);
  // Collapse is a reading decision, not a preference: it is remembered per chat and never
  // surfaced in settings. See ./collapsed-state.ts for why this outlives the component.
  const [isCollapsed, handleToggleCollapsed] = useChatOutlineCollapsed(agentId);
  const { t } = useTranslation();

  useEffect(() => {
    if (isCollapsed) onLeave();
  }, [isCollapsed, onLeave]);

  const handlePromptText = useCallback((seq: number, text: string) => {
    setPromptTexts((current) => mergePromptText(current, seq, text));
  }, []);

  // The index carries only a truncated preview, so each row reads its own full text once.
  // The reader scans the rail instead of hovering it. Prompts already loaded in the
  // transcript cost no request at all, and the reader's own cache dedupes the rest.
  useEffect(() => {
    if (isCollapsed) return;
    void readPromptTexts(prompts, onRequestPromptText, handlePromptText);
  }, [handlePromptText, isCollapsed, onRequestPromptText, prompts]);

  return (
    <View
      style={[styles.textRail, inlineUnistylesStyle({ width })]}
      role="tablist"
      testID="chat-outline-text-rail"
    >
      <View style={styles.textRailHeader}>
        <Button
          variant="secondary"
          size="xs"
          leftIcon={isCollapsed ? ChevronDown : ChevronUp}
          onPress={handleToggleCollapsed}
          accessibilityLabel={t(
            isCollapsed ? "agentStream.chatOutline.expand" : "agentStream.chatOutline.collapse",
          )}
          testID="chat-outline-text-toggle"
        />
      </View>
      {isCollapsed ? null : (
        <ScrollView
          style={styles.textRailScroll}
          contentContainerStyle={styles.textRailContent}
          showsVerticalScrollIndicator={false}
        >
          {prompts.map((prompt, index) => (
            <ChatOutlineTextRow
              key={prompt.seq}
              index={index}
              seq={prompt.seq}
              text={promptTexts.get(prompt.seq) ?? prompt.preview}
              label={`${index + 1} of ${prompts.length}: ${prompt.preview}`}
              isActive={prompt.seq === activeSeq}
              onHover={onHover}
              onFocusChange={onFocusChange}
              onJumpToPrompt={onJumpToPrompt}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

interface ChatOutlineTextRowProps {
  index: number;
  seq: number;
  text: string;
  label: string;
  isActive: boolean;
  onHover: (index: number) => void;
  onFocusChange: (index: number, focused: boolean) => void;
  onJumpToPrompt: (seq: number) => void;
}

const ChatOutlineTextRow = memo(function ChatOutlineTextRow({
  index,
  seq,
  text,
  label,
  isActive,
  onHover,
  onFocusChange,
  onJumpToPrompt,
}: ChatOutlineTextRowProps) {
  const handlePress = useCallback(() => {
    onJumpToPrompt(seq);
    onFocusChange(index, false);
  }, [index, onFocusChange, onJumpToPrompt, seq]);
  const handlePointerEnter = useCallback(() => onHover(index), [index, onHover]);
  const handleFocus = useCallback(() => onFocusChange(index, true), [index, onFocusChange]);
  const handleBlur = useCallback(() => onFocusChange(index, false), [index, onFocusChange]);

  return (
    <View style={styles.textRow} onPointerEnter={handlePointerEnter}>
      {/* The row scrolls its own overflow, so a long prompt stays readable without
          hovering and without pushing the next prompt off the rail. The press target sits
          inside the scroller: a press on the scrollbar must not jump the transcript. */}
      <ScrollView
        style={styles.textRowScroll}
        showsVerticalScrollIndicator
        testID={`chat-outline-text-scroll-${seq}`}
      >
        <Pressable
          style={[styles.textRowTarget, index > 0 && styles.textRowDivider]}
          onPress={handlePress}
          onFocus={handleFocus}
          onBlur={handleBlur}
          accessibilityRole="tab"
          aria-selected={isActive}
          accessibilityLabel={label}
          testID={`chat-outline-text-row-${seq}`}
        >
          <Text style={[styles.textRowLabel, isActive && styles.textRowLabelActive]}>{text}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  panelMeasure: {
    position: "absolute",
    inset: 0,
  },
  rail: {
    position: "absolute",
    left: theme.spacing[2],
    top: "10%",
    bottom: "10%",
    width: RAIL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  // Slots tile the rail with no gaps, so every pixel of the column belongs to a prompt even
  // when a long conversation squeezes them well below their resting height.
  slot: {
    width: RAIL_WIDTH,
    flexBasis: SLOT_HEIGHT,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Pills share one left rail and grow rightward, so magnification reads as a bulge moving
  // with the pointer instead of every tick breathing about its own centre.
  target: {
    width: "100%",
    height: "100%",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: theme.spacing[1],
    borderRadius: theme.borderRadius.base,
  },
  // At rest the pills use low-emphasis chrome so the column stays readable peripherally
  // without competing with the transcript. Attention is the only foreground state.
  pill: {
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.borderAccent,
    transitionProperty: "width, height, background-color",
    transitionDuration: "140ms",
    transitionTimingFunction: "ease-out",
  },
  pillActive: {
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  pillAttention: {
    backgroundColor: theme.colors.foreground,
  },
  preview: {
    position: "absolute",
    left: RAIL_WIDTH + PREVIEW_GAP,
    top: "50%",
    marginTop: -PREVIEW_HEIGHT / 2,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.md,
  },
  previewText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  // The text outline shares the rail's vertical extent but rides the right gutter, so the
  // dots keep the left edge and the two never overlap.
  textRail: {
    position: "absolute",
    right: theme.spacing[2],
    top: "10%",
    bottom: "10%",
    zIndex: 2,
  },
  // A fixed header row keeps the toggle in the same place whether the list is showing or
  // collapsed, so collapsing never shifts the rail sideways.
  textRailHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  textRailScroll: {
    flex: 1,
  },
  // Theme-free on purpose: a themed contentContainerStyle on a third-party scroller is
  // dropped on web. See docs/unistyles.md.
  textRailContent: {
    paddingVertical: 0,
  },
  textRow: {
    justifyContent: "center",
  },
  // Hover must not change this box's geometry, only its paint. See docs/hover.md.
  textRowTarget: {
    justifyContent: "center",
    minHeight: TEXT_ROW_MIN_HEIGHT,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  // Rows after the first carry one top border, the same divider settings rows use. The
  // first row follows the header, which is separation enough.
  textRowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  textRowLabel: {
    fontSize: theme.fontSize.base,
    lineHeight: TEXT_ROW_LINE_HEIGHT,
    color: theme.colors.foreground,
  },
  textRowLabelActive: {
    color: activePromptColor(theme),
  },
  // The row owns the whole prompt but never more than a few lines of it; the rest is
  // reachable by scrolling the row itself.
  textRowScroll: {
    maxHeight: TEXT_ROW_MAX_HEIGHT,
  },
}));
