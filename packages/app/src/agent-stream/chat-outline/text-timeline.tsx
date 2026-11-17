import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as NativeScrollView,
} from "react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { ScrollView } from "@/components/ui/scroll-view";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { ChatOutlinePrompt } from "./model";
import {
  TEXT_ROW_LINE_HEIGHT,
  TEXT_ROW_MAX_LINES,
  collapsePromptWhitespace,
  type ChatOutlineRowLayout,
} from "./text-rail-model";
import { ChatOutlineTextSeparator } from "./text-rail-separator";

const NO_ROW_LAYOUTS: ReadonlyMap<number, ChatOutlineRowLayout> = new Map();
const PROGRAMMATIC_SCROLL_WINDOW_MS = 500;
const PROGRAMMATIC_SCROLL_TOLERANCE_PX = 2;
const FOLLOW_RESUME_DELAY_MS = 1500;

interface ChatOutlineTextTimelineProps {
  prompts: readonly ChatOutlinePrompt[];
  activeSeq?: number | null;
  /** 不传时行不可点击，用于只阅读的历史预览。 */
  onSelectPrompt?: (seq: number) => void;
  /** active 跟随当前提问；bottom 在内容就绪后滚到末尾一次。 */
  initialScroll?: "active" | "bottom";
}

/**
 * 用户时间线：首行吸顶，其余行滚动。只负责列表本身，位置和尺寸由宿主给。
 * 换会话时宿主用 key 重挂载，滚动状态不会串到另一条会话。
 */
export const ChatOutlineTextTimeline = memo(function ChatOutlineTextTimeline({
  prompts,
  activeSeq = null,
  onSelectPrompt,
  initialScroll = "active",
}: ChatOutlineTextTimelineProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<NativeScrollView>(null);
  const [rowLayouts, setRowLayouts] =
    useState<ReadonlyMap<number, ChatOutlineRowLayout>>(NO_ROW_LAYOUTS);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const programmaticScrollUntilRef = useRef(0);
  const lastUserScrollAtRef = useRef(0);
  const lastScrollTargetRef = useRef<number | null>(null);
  const hasScrolledToEndRef = useRef(false);

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

  useEffect(() => {
    if (isFollowing || activeSeq === null || initialScroll !== "active") return;
    if (Date.now() - lastUserScrollAtRef.current < FOLLOW_RESUME_DELAY_MS) return;
    lastScrollTargetRef.current = null;
    setIsFollowing(true);
  }, [activeSeq, initialScroll, isFollowing]);

  useEffect(() => {
    if (!isFollowing || initialScroll !== "active" || activeSeq === null) return;
    if (prompts[0]?.seq === activeSeq) {
      if (lastScrollTargetRef.current === 0) return;
      lastScrollTargetRef.current = 0;
      programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const layout = rowLayouts.get(activeSeq);
    if (!layout) return;
    const target = Math.max(
      0,
      viewportHeight === 0 ? layout.y : layout.y + layout.height / 2 - viewportHeight / 2,
    );
    if (lastScrollTargetRef.current === target) return;
    lastScrollTargetRef.current = target;
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
    scrollRef.current?.scrollTo({ y: target, animated: false });
  }, [activeSeq, initialScroll, isFollowing, prompts, rowLayouts, viewportHeight]);

  const handleContentSizeChange = useCallback(() => {
    if (initialScroll !== "bottom" || hasScrolledToEndRef.current) return;
    hasScrolledToEndRef.current = true;
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [initialScroll]);

  const handleSelectPrompt = useCallback(
    (seq: number) => {
      setIsFollowing(true);
      onSelectPrompt?.(seq);
    },
    [onSelectPrompt],
  );

  const rows = useMemo(
    () =>
      prompts.map((prompt, index) => ({
        key: prompt.seq,
        index,
        seq: prompt.seq,
        text: collapsePromptWhitespace(prompt.preview),
        label: t("agentStream.chatOutline.rowLabel", {
          index: index + 1,
          total: prompts.length,
          text: prompt.preview,
        }),
        isActive: prompt.seq === activeSeq,
        onPress: () => handleSelectPrompt(prompt.seq),
        onLayout: (event: LayoutChangeEvent) => {
          const { y, height } = event.nativeEvent.layout;
          handleRowMeasure(prompt.seq, { y, height });
        },
      })),
    [activeSeq, handleSelectPrompt, handleRowMeasure, prompts, t],
  );

  const renderRowBody = (row: (typeof rows)[number]) => (
    <Text
      style={[styles.label, row.isActive && styles.labelActive]}
      numberOfLines={TEXT_ROW_MAX_LINES}
    >
      {row.text}
    </Text>
  );

  const renderRow = (row: (typeof rows)[number]) => {
    const body = renderRowBody(row);
    return onSelectPrompt ? (
      <PressHighlight
        key={row.key}
        style={styles.row}
        onLayout={row.onLayout}
        onPress={row.onPress}
        accessibilityRole="tab"
        aria-selected={row.isActive}
        accessibilityLabel={row.label}
        testID={`chat-outline-text-row-${row.seq}`}
      >
        {body}
      </PressHighlight>
    ) : (
      <View
        key={row.key}
        style={styles.row}
        onLayout={row.onLayout}
        testID={`chat-outline-text-row-${row.seq}`}
      >
        {body}
      </View>
    );
  };

  const stickyRow = rows[0];
  const scrollRows = rows.slice(1);
  const renderScrollRow = (row: (typeof rows)[number]) => (
    <Fragment key={row.key}>
      <ChatOutlineTextSeparator index={row.index} seq={row.seq} />
      {renderRow(row)}
    </Fragment>
  );
  const interactive = onSelectPrompt !== undefined;

  return (
    <View
      style={styles.list}
      role={interactive ? "tablist" : undefined}
      testID="chat-outline-text-rail"
    >
      {stickyRow ? (
        <Fragment key={stickyRow.key}>
          <ChatOutlineTextSeparator index={stickyRow.index} seq={stickyRow.seq} />
          {renderRow(stickyRow)}
        </Fragment>
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        onLayout={handleListLayout}
        onScroll={handleListScroll}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={16}
        onScrollBeginDrag={handleListScrollBeginDrag}
        testID="chat-outline-text-list"
      >
        {scrollRows.map(renderScrollRow)}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  row: {
    justifyContent: "center",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
  },
  label: {
    fontSize: theme.fontSize.base,
    lineHeight: TEXT_ROW_LINE_HEIGHT,
    color: theme.colors.foregroundMuted,
  },
  labelActive: {
    color: theme.colors.foreground,
  },
}));
