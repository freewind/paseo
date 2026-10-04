import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useReducedMotion } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useContainerWidth, useContainerWidthBelow } from "@/hooks/use-container-width";
import { useHoverSafeZone } from "@/hooks/use-hover-safe-zone";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { ICON_SIZE } from "@/styles/theme";
import { createChatOutlineHoverIntent } from "./hover-intent";
import { useChatOutlineCollapsed } from "./collapsed-state";
import { promptTickMagnification, resolveTextRailWidth, type ChatOutlinePrompt } from "./model";
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
// The text preview carries a whole prompt, so it gets room and its own scroll.
const TEXT_PREVIEW_WIDTH = 320;
const TEXT_PREVIEW_HEIGHT = 180;
const TOGGLE_SIZE = 20;

const ThemedChevronDown = withUnistyles(ChevronDown, mutedIconColorMapping);
const ThemedChevronUp = withUnistyles(ChevronUp, mutedIconColorMapping);

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
          attentionIndex={attentionIndex}
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
      {hasAttention ? (
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
  attentionIndex: number | null;
  width: number;
  agentId: string;
  onHover: (index: number) => void;
  onLeave: () => void;
  onFocusChange: (index: number, focused: boolean) => void;
  onJumpToPrompt: (seq: number) => void;
  onRequestPromptText: (seq: number) => Promise<string | null>;
}

const ChatOutlineTextRail = memo(function ChatOutlineTextRail({
  prompts,
  activeSeq,
  attentionIndex,
  width,
  agentId,
  onHover,
  onLeave,
  onFocusChange,
  onJumpToPrompt,
  onRequestPromptText,
}: ChatOutlineTextRailProps) {
  const railRef = useRef<View>(null);
  const previewRef = useRef<View>(null);
  const [previewTop, setPreviewTop] = useState(0);
  const [detail, setDetail] = useState<{ seq: number; text: string } | null>(null);
  // Collapse is a reading decision, not a preference: it is remembered per chat and never
  // surfaced in settings. See ./collapsed-state.ts for why this outlives the component.
  const [isCollapsed, handleToggleCollapsed] = useChatOutlineCollapsed(agentId);
  const { t } = useTranslation();
  const attentionSeq = attentionIndex !== null ? (prompts[attentionIndex]?.seq ?? null) : null;

  useEffect(() => {
    if (isCollapsed && attentionIndex !== null) onLeave();
  }, [attentionIndex, isCollapsed, onLeave]);

  // The index only carries a truncated preview, so the full text is read on demand.
  // Keying the state by seq keeps one row's text from flashing inside another row's card.
  useEffect(() => {
    if (attentionSeq === null) return;
    let active = true;
    void onRequestPromptText(attentionSeq).then((text) => {
      if (active && text !== null) setDetail({ seq: attentionSeq, text });
      return undefined;
    });
    return () => {
      active = false;
    };
  }, [attentionSeq, onRequestPromptText]);

  // The card is a sibling of the scroller (a child would be clipped by its
  // overflow), so it has to follow its row: measured against the rail, then
  // re-measured as the scroller moves the row underneath a resting pointer.
  const measurePreview = useCallback(() => {
    const rail = railRef.current as unknown as Element | null;
    if (rail === null || attentionIndex === null) return;
    const seq = prompts[attentionIndex]?.seq;
    const row = rail.querySelector(`[data-testid="chat-outline-text-row-${seq}"]`);
    if (!(row instanceof Element)) return;
    const railBounds = rail.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const rowCentre = rowBounds.top - railBounds.top + rowBounds.height / 2;
    const maxTop = Math.max(railBounds.height - TEXT_PREVIEW_HEIGHT, 0);
    setPreviewTop(Math.min(Math.max(rowCentre - TEXT_PREVIEW_HEIGHT / 2, 0), maxTop));
  }, [attentionIndex, prompts]);

  useLayoutEffect(() => {
    if (attentionIndex === null) return;
    measurePreview();
  }, [attentionIndex, measurePreview]);

  const handleEnterSafeZone = useCallback(() => {}, []);
  // The card sits outside the rail's box, and its region passes pointer events through to
  // the transcript below, so pointerleave on the rail fires exactly while the pointer is
  // over the card. The rect-based safe zone is therefore the only closer. See docs/hover.md.
  const handleLeaveSafeZone = useCallback(() => {
    onLeave();
    if (attentionIndex !== null) onFocusChange(attentionIndex, false);
  }, [attentionIndex, onFocusChange, onLeave]);
  useHoverSafeZone({
    enabled: attentionIndex !== null,
    triggerRef: railRef,
    contentRef: previewRef,
    onEnterSafeZone: handleEnterSafeZone,
    onLeaveSafeZone: handleLeaveSafeZone,
  });

  return (
    <View
      ref={railRef}
      style={[styles.textRail, inlineUnistylesStyle({ width })]}
      role="tablist"
      testID="chat-outline-text-rail"
    >
      <View style={styles.textRailHeader}>
        <Pressable
          style={styles.textRailToggle}
          onPress={handleToggleCollapsed}
          accessibilityRole="button"
          accessibilityLabel={t(
            isCollapsed ? "agentStream.chatOutline.expand" : "agentStream.chatOutline.collapse",
          )}
          testID="chat-outline-text-toggle"
        >
          {isCollapsed ? (
            <ThemedChevronDown size={ICON_SIZE.xs} />
          ) : (
            <ThemedChevronUp size={ICON_SIZE.xs} />
          )}
        </Pressable>
      </View>
      {isCollapsed ? null : (
        <ScrollView
          style={styles.textRailScroll}
          contentContainerStyle={styles.textRailContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={measurePreview}
        >
          {prompts.map((prompt, index) => (
            <ChatOutlineTextRow
              key={prompt.seq}
              index={index}
              seq={prompt.seq}
              preview={prompt.preview}
              label={`${index + 1} of ${prompts.length}: ${prompt.preview}`}
              isActive={prompt.seq === activeSeq}
              onHover={onHover}
              onFocusChange={onFocusChange}
              onJumpToPrompt={onJumpToPrompt}
            />
          ))}
        </ScrollView>
      )}
      {attentionIndex !== null ? (
        <View
          ref={previewRef}
          style={[styles.textPreview, inlineUnistylesStyle({ top: previewTop })]}
          pointerEvents="none"
          aria-hidden
          testID="chat-outline-text-preview"
        >
          <ScrollView style={styles.textPreviewScroll} nestedScrollEnabled>
            <Text style={styles.previewText}>
              {detail !== null && detail.seq === attentionSeq
                ? detail.text
                : (prompts[attentionIndex]?.preview ?? "")}
            </Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
});

interface ChatOutlineTextRowProps {
  index: number;
  seq: number;
  preview: string;
  label: string;
  isActive: boolean;
  onHover: (index: number) => void;
  onFocusChange: (index: number, focused: boolean) => void;
  onJumpToPrompt: (seq: number) => void;
}

const ChatOutlineTextRow = memo(function ChatOutlineTextRow({
  index,
  seq,
  preview,
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
      <Pressable
        style={styles.textRowTarget}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole="tab"
        aria-selected={isActive}
        accessibilityLabel={label}
        testID={`chat-outline-text-row-${seq}`}
      >
        <Text
          style={[styles.textRowLabel, isActive && styles.textRowLabelActive]}
          numberOfLines={3}
          ellipsizeMode="tail"
        >
          {preview}
        </Text>
      </Pressable>
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
    justifyContent: "flex-start",
  },
  textRailToggle: {
    alignItems: "center",
    justifyContent: "center",
    width: TOGGLE_SIZE,
    height: TOGGLE_SIZE,
    marginLeft: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
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
  textRowLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  textRowLabelActive: {
    color: theme.colors.foreground,
  },
  // The rail is on the right, so the card opens back over the transcript it describes.
  textPreview: {
    position: "absolute",
    right: "100%",
    marginRight: PREVIEW_GAP,
    width: TEXT_PREVIEW_WIDTH,
    height: TEXT_PREVIEW_HEIGHT,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.md,
  },
  textPreviewScroll: {
    flex: 1,
  },
}));
