import React, {
  memo,
  useCallback,
  useEffect,
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useContainerWidth, useContainerWidthBelow } from "@/hooks/use-container-width";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { Button } from "@/components/ui/button";
import { useChatOutlineCollapsed } from "./collapsed-state";
import {
  collapsePromptWhitespace,
  resolveSideRailWidth,
  SIDE_RAIL_MIN_PANEL_WIDTH,
  TEXT_ROW_LINE_HEIGHT,
  TEXT_ROW_MAX_LINES,
  type ChatOutlinePrompt,
} from "./model";
import type { ChatOutlineRailProps } from "./rail";
import { ChatOutlineUpstreamRail } from "./dots.web";
import { PromptDetailPopover } from "./prompt-detail.web";

const MIN_PANEL_WIDTH = SIDE_RAIL_MIN_PANEL_WIDTH;

const ChatOutlineFreewindRail = memo(function ChatOutlineFreewindRail({
  prompts,
  activePrompt,
  onJumpToPrompt,
  contentMaxWidth,
  agentId,
  onRequestPromptText,
}: ChatOutlineRailProps) {
  const panelRef = useRef<View>(null);
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
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

  if (prompts.length < 2) return null;

  // The measure-only view keeps the width available while the panel has no gutter to put the
  // outline in, so the outline appears without the transcript column resizing around it.
  const textRailWidth = resolveSideRailWidth(panelWidth, contentMaxWidth);

  if (isPanelNarrow || textRailWidth === null) {
    return <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout} />;
  }

  return (
    <View ref={panelRef} style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout}>
      <ChatOutlineTextRail
        // A different chat is a different outline, so it gets a fresh instance and
        // re-reads its own collapse rather than inheriting the previous chat's.
        key={agentId}
        prompts={prompts}
        activeSeq={activeSeq}
        width={textRailWidth}
        panelRef={panelRef}
        agentId={agentId}
        onJumpToPrompt={onJumpToPrompt}
        onRequestPromptText={onRequestPromptText}
      />
    </View>
  );
});

/**
 * Freewind mode draws the worded outline on the left. Off keeps the upstream outline — dots
 * plus the optional worded list — exactly as upstream ships it.
 */
export const ChatOutlineRail = memo(function ChatOutlineRail(props: ChatOutlineRailProps) {
  if (props.variant === "freewind") {
    return <ChatOutlineFreewindRail {...props} />;
  }
  return <ChatOutlineUpstreamRail {...props} />;
});

interface ChatOutlineTextRailProps {
  prompts: ChatOutlinePrompt[];
  activeSeq: number | null;
  width: number;
  panelRef: React.RefObject<View | null>;
  agentId: string;
  onJumpToPrompt: (seq: number) => void;
  onRequestPromptText: (seq: number) => Promise<string | null>;
}

/** A row's box inside the list's content, measured once it has laid out. */
interface ChatOutlineRowLayout {
  y: number;
  height: number;
}

const NO_ROW_LAYOUTS: ReadonlyMap<number, ChatOutlineRowLayout> = new Map();
/** How long a programmatic scroll keeps the next scroll events from reading as the reader's. */
const PROGRAMMATIC_SCROLL_WINDOW_MS = 500;

/**
 * A scroll that lands on the row the list asked for is the list's own. Without this the tail of a
 * smooth scroll arrives after the window above and reads as the reader scrolling the rail.
 */
const PROGRAMMATIC_SCROLL_TOLERANCE_PX = 2;

/** How long the rail stays parked after the reader scrolls it before following the chat again. */
const FOLLOW_RESUME_DELAY_MS = 1500;

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
  panelRef,
  agentId,
  onJumpToPrompt,
  onRequestPromptText,
}: ChatOutlineTextRailProps) {
  const [promptTexts, setPromptTexts] = useState<ReadonlyMap<number, string>>(NO_PROMPT_TEXTS);
  // Collapse is a reading decision, not a preference: it is remembered per chat and never
  // surfaced in settings. See ./collapsed-state.ts for why this outlives the component.
  const [isCollapsed, handleToggleCollapsed] = useChatOutlineCollapsed(agentId);
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [rowLayouts, setRowLayouts] =
    useState<ReadonlyMap<number, ChatOutlineRowLayout>>(NO_ROW_LAYOUTS);
  const [viewportHeight, setViewportHeight] = useState(0);
  // The list follows the transcript until the reader scrolls it themselves; jumping to a prompt
  // hands it back. Anything else would yank the list out from under someone reading it.
  const [isFollowing, setIsFollowing] = useState(true);
  const programmaticScrollUntilRef = useRef(0);
  /** When the reader last scrolled the list themselves; the follow resumes after a pause. */
  const lastUserScrollAtRef = useRef(0);
  // Measuring a row re-runs the follow effect; an unchanged target must not restart the scroll.
  const lastScrollTargetRef = useRef<number | null>(null);
  // The popover's anchor is measured in window space, so the row that opened it has to
  // stay addressable after the click. Only one popover exists at a time: a click on the
  // open row closes it, a click on another row moves it.
  const [openPromptSeq, setOpenPromptSeq] = useState<number | null>(null);
  const openRowRef = useRef<View>(null);
  const textRequestEpoch = useRef(0);
  // The reader is a new closure on most renders; holding it in a ref keeps the bulk read tied to
  // the prompt list instead of restarting for every render.
  const readPromptTextRef = useRef(onRequestPromptText);
  useEffect(() => {
    readPromptTextRef.current = onRequestPromptText;
  }, [onRequestPromptText]);
  // Mirrors `promptTexts` so the read can skip what it already has without subscribing to it.
  const promptTextsRef = useRef<ReadonlyMap<number, string>>(NO_PROMPT_TEXTS);

  const handlePromptText = useCallback((seq: number, text: string) => {
    const next = mergePromptText(promptTextsRef.current, seq, text);
    if (next === promptTextsRef.current) return;
    promptTextsRef.current = next;
    setPromptTexts(next);
  }, []);

  const handleRowMeasure = useCallback((seq: number, layout: ChatOutlineRowLayout) => {
    setRowLayouts((current) => {
      const previous = current.get(seq);
      if (previous && previous.y === layout.y && previous.height === layout.height) return current;
      const next = new Map(current);
      next.set(seq, layout);
      return next;
    });
  }, []);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const target = lastScrollTargetRef.current;
    if (
      target !== null &&
      Math.abs(event.nativeEvent.contentOffset.y - target) <= PROGRAMMATIC_SCROLL_TOLERANCE_PX
    ) {
      return;
    }
    if (Date.now() < programmaticScrollUntilRef.current) return;
    lastUserScrollAtRef.current = Date.now();
    setIsFollowing(false);
  }, []);

  const handleListScrollBeginDrag = useCallback(() => {
    lastUserScrollAtRef.current = Date.now();
    setIsFollowing(false);
  }, []);

  // Following comes back once the reader is in the chat again. Without this a single wheel nudge
  // over the list stopped the rail for the rest of the session, and the highlight kept moving
  // while the list stayed put.
  useEffect(() => {
    if (isFollowing || activeSeq === null) return;
    if (Date.now() - lastUserScrollAtRef.current < FOLLOW_RESUME_DELAY_MS) return;
    // Forget the last target: the row the chat is on now may share a scroll offset with the one
    // the rail stopped at, and that must not count as already scrolled there.
    lastScrollTargetRef.current = null;
    setIsFollowing(true);
  }, [activeSeq, isFollowing]);

  // Row heights come from measured boxes, not `index * lineHeight`: rows clamp at two lines and
  // the numbered dividers between them belong to the same content flow.
  useEffect(() => {
    if (!isFollowing || activeSeq === null) return;
    const layout = rowLayouts.get(activeSeq);
    if (!layout) return;
    // A viewport that has not been measured yet still scrolls: aligning the row's top is better
    // than leaving the highlight off screen.
    const target = Math.max(
      0,
      viewportHeight === 0 ? layout.y : layout.y + layout.height / 2 - viewportHeight / 2,
    );
    if (lastScrollTargetRef.current === target) return;
    lastScrollTargetRef.current = target;
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
    // Instant: a smooth animation keeps emitting scroll events past the programmatic window, and
    // the ones that arrive late read as the reader scrolling the rail, which stops the following
    // for good. Jumping to a prompt stays animated.
    scrollRef.current?.scrollTo({
      y: target,
      animated: false,
    });
  }, [activeSeq, isFollowing, rowLayouts, viewportHeight]);

  // The index carries only a truncated preview, so each row reads its own full text once.
  // The reader scans the rail instead of hovering it. Prompts already loaded in the
  // transcript cost no request at all, and the reader's own cache dedupes the rest.
  useEffect(() => {
    if (isCollapsed) return undefined;
    // Only the prompts without text: a re-run after the list grows must not ask again for the
    // rows that already have theirs.
    const missing = prompts.filter((prompt) => !promptTextsRef.current.has(prompt.seq));
    if (missing.length === 0) return undefined;
    const request = textRequestEpoch;
    const epoch = ++request.current;
    void readPromptTexts(
      missing,
      (seq) => readPromptTextRef.current(seq),
      (seq, text) => {
        if (request.current === epoch) handlePromptText(seq, text);
      },
    );
    return () => {
      request.current++;
    };
  }, [handlePromptText, isCollapsed, prompts]);

  // Collapse closes any open popover along with the rows, because the popover is a child
  // of the rail's layer and its anchor row is gone with them.
  useEffect(() => {
    if (isCollapsed) setOpenPromptSeq(null);
  }, [isCollapsed]);

  const handleTogglePrompt = useCallback((seq: number) => {
    setOpenPromptSeq((current) => (current === seq ? null : seq));
  }, []);

  const handleClosePrompt = useCallback(() => setOpenPromptSeq(null), []);

  // Jumping is the reader saying where they want to be, so the list resumes following them.
  const handleJumpToPrompt = useCallback(
    (seq: number) => {
      setIsFollowing(true);
      onJumpToPrompt(seq);
    },
    [onJumpToPrompt],
  );

  const openIndex = openPromptSeq === null ? -1 : prompts.findIndex((p) => p.seq === openPromptSeq);
  const openPrompt = openIndex >= 0 ? prompts[openIndex] : null;

  return (
    <>
      {/* The backdrop owns every click that is neither the rail nor the popover, so the
          reader closes the popover the way every floating layer closes: by clicking away.
          It is anchored to the panel layer and rendered before the rail, so the rail and
          the popover above it still take their own clicks. */}
      {!isCollapsed && openPrompt !== null ? (
        <Pressable
          style={styles.backdrop}
          onPress={handleClosePrompt}
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.close")}
          aria-hidden
          testID="chat-outline-prompt-backdrop"
        />
      ) : null}
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
            ref={scrollRef}
            style={styles.textRailScroll}
            contentContainerStyle={styles.textRailContent}
            showsVerticalScrollIndicator={false}
            onLayout={handleListLayout}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={handleListScrollBeginDrag}
            testID="chat-outline-text-list"
          >
            {prompts.map((prompt, index) => (
              <ChatOutlineTextRow
                key={prompt.seq}
                index={index}
                seq={prompt.seq}
                text={collapsePromptWhitespace(promptTexts.get(prompt.seq) ?? prompt.preview)}
                label={`${index + 1} of ${prompts.length}: ${prompt.preview}`}
                isActive={prompt.seq === activeSeq}
                isOpen={prompt.seq === openPromptSeq}
                rowRef={prompt.seq === openPromptSeq ? openRowRef : undefined}
                onMeasure={handleRowMeasure}
                onTogglePrompt={handleTogglePrompt}
              />
            ))}
          </ScrollView>
        )}
      </View>
      {!isCollapsed && openPrompt !== null ? (
        <PromptDetailPopover
          key={openPrompt.seq}
          prompt={openPrompt}
          index={openIndex}
          total={prompts.length}
          onRequestPromptText={onRequestPromptText}
          rowRef={openRowRef}
          panelRef={panelRef}
          onJumpToPrompt={handleJumpToPrompt}
          onClose={handleClosePrompt}
        />
      ) : null}
    </>
  );
});

interface ChatOutlineTextRowProps {
  index: number;
  seq: number;
  text: string;
  label: string;
  isActive: boolean;
  isOpen: boolean;
  rowRef?: React.RefObject<View | null>;
  onMeasure: (seq: number, layout: ChatOutlineRowLayout) => void;
  onTogglePrompt: (seq: number) => void;
}

const ChatOutlineTextRow = memo(function ChatOutlineTextRow({
  index,
  seq,
  text,
  label,
  isActive,
  isOpen,
  rowRef,
  onMeasure,
  onTogglePrompt,
}: ChatOutlineTextRowProps) {
  const accessibilityState = useMemo(() => ({ expanded: isOpen }), [isOpen]);
  const handlePress = useCallback(() => {
    onTogglePrompt(seq);
  }, [onTogglePrompt, seq]);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      onMeasure(seq, { y, height });
    },
    [onMeasure, seq],
  );

  return (
    <>
      {/* A hairline between two prompts, not a border on the row: a bordered row with a
          radius reads as a box around every prompt. It sits outside the padding so the
          gap above and below it is the same. */}
      {index > 0 ? (
        <View
          style={styles.textRowDivider}
          testID={`chat-outline-text-divider-${seq}`}
          // 🌿 A bare digit is the whole copy, so the mark goes on the only text the
          // element carries.
          accessibilityLabel={`🌿 ${index + 1}`}
        >
          <View style={styles.textRowDividerLine} />
          <Text style={styles.textRowDividerLabel}>{`(${index + 1})`}</Text>
          <View style={styles.textRowDividerLine} />
        </View>
      ) : null}
      <View style={styles.textRow} ref={rowRef} onLayout={handleLayout}>
        {/* The row clamps its own lines instead of scrolling them: a scroller here is a
            wheel trap that eats the scroll before the list gets it, so the rail owns the
            only vertical scroller and a click opens the full text in a popover instead. */}
        <Pressable
          style={[styles.textRowTarget, isOpen && styles.textRowTargetOpen]}
          onPress={handlePress}
          accessibilityRole="tab"
          aria-selected={isActive}
          accessibilityLabel={label}
          accessibilityState={accessibilityState}
          testID={`chat-outline-text-row-${seq}`}
        >
          <Text
            style={[styles.textRowLabel, isActive && styles.textRowLabelActive]}
            numberOfLines={TEXT_ROW_MAX_LINES}
          >
            {text}
          </Text>
        </Pressable>
      </View>
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  panelMeasure: {
    position: "absolute",
    inset: 0,
  },
  // The outline takes the gutter left of the transcript's content column. The gutter width is
  // the same one the panel leaves on the right, so both sides of the transcript stay symmetric.
  textRail: {
    position: "absolute",
    left: theme.spacing[2],
    top: "10%",
    bottom: "10%",
    zIndex: 2,
  },
  // A fixed header row keeps the toggle in the same place whether the list is showing or
  // collapsed, so collapsing never shifts the rail sideways. The rail sits on the left edge, so
  // `flex-end` puts the toggle on the side facing the transcript instead of the panel's outer
  // edge: it reads as part of the chat rather than as panel chrome.
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
  // The padding lives on the row, not on the press target: padding in there would move
  // the clamp's cut with it and let two rows touch.
  textRow: {
    justifyContent: "center",
    paddingVertical: theme.spacing[3],
  },
  // Nothing here draws a border or a radius: a rounded bordered row reads as a box.
  // Hover must not change this box's geometry, only its paint. See docs/hover.md.
  textRowTarget: {
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  // Rows after the first are separated by one full-width hairline, the same divider the
  // settings rows use. The first row follows the header, which is separation enough.
  // The line is broken in the middle by the ordinal of the prompt below it: a reader who
  // wants prompt 12 says "12" instead of counting rows down a long conversation.
  textRowDivider: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Equal flex on both halves is what keeps the ordinal on the rail's centre line, so the
  // number sits over the same axis the rows above and below it occupy.
  textRowDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  // Flat and quiet: the ordinal is a locator, not a heading. Parentheses are the whole
  // styling, so no weight or letter spacing is added on top of them.
  textRowDividerLabel: {
    paddingHorizontal: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  // The prompt the reader is inside is marked with the theme's own foreground pair, the
  // same way every list marks its selection: the row being read comes forward, the rest
  // recede. A hue here would have to be hand-picked per scheme and would shout in dark.
  textRowLabel: {
    fontSize: theme.fontSize.base,
    lineHeight: TEXT_ROW_LINE_HEIGHT,
    color: theme.colors.foregroundMuted,
  },
  textRowLabelActive: {
    color: theme.colors.foreground,
  },
  // The row whose popover is open comes forward with the theme's own hover surface, the
  // same paint-only change the rail's rows already use. See docs/hover.md.
  textRowTargetOpen: {
    backgroundColor: theme.colors.surface2,
  },
  // The backdrop covers the rail's whole layer so a click anywhere outside the popover
  // closes it. It is rendered before the rail's rows, so the rows and the popover above
  // it still take their own clicks.
  backdrop: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
  },
}));
