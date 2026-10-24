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
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { Button } from "@/components/ui/button";
import type { ChatOutlinePrompt } from "./model";
import {
  TEXT_ROW_LINE_HEIGHT,
  TEXT_ROW_MAX_LINES,
  collapsePromptWhitespace,
  type ChatOutlineRowLayout,
} from "./text-rail-model";
import { ChatOutlineTextSeparator } from "./text-rail-separator";

export interface ChatOutlineTextListProps {
  prompts: readonly ChatOutlinePrompt[];
  activeSeq: number | null;
  width: number;
  agentId: string;
  onJumpToPrompt: (seq: number) => void;
}

const NO_ROW_LAYOUTS: ReadonlyMap<number, ChatOutlineRowLayout> = new Map();
/** 折叠过的 agent。模块级：换一个 chat 会重挂载列表，组件内的 state 会跟着重置。 */
const collapsedAgents = new Set<string>();
const PROGRAMMATIC_SCROLL_WINDOW_MS = 500;

/**
 * 落在列表要求的那一行上的滚动是列表自己发起的。没有这个判断，
 * 平滑滚动的尾部会在上面的时间窗之后才到达，被当成读者在滚这条栏。
 */
const PROGRAMMATIC_SCROLL_TOLERANCE_PX = 2;

const FOLLOW_RESUME_DELAY_MS = 1500;

export const ChatOutlineTextList = memo(function ChatOutlineTextList({
  prompts,
  activeSeq,
  width,
  agentId,
  onJumpToPrompt,
}: ChatOutlineTextListProps) {
  // 折叠是阅读决定，不是偏好，所以不进设置页。
  const [isCollapsed, setIsCollapsed] = useState(() => collapsedAgents.has(agentId));
  const handleToggleCollapsed = useCallback(() => {
    setIsCollapsed((current) => {
      if (current) collapsedAgents.delete(agentId);
      else collapsedAgents.add(agentId);
      return !current;
    });
  }, [agentId]);
  const { t } = useTranslation();
  const scrollRef = useRef<NativeScrollView>(null);
  const [rowLayouts, setRowLayouts] =
    useState<ReadonlyMap<number, ChatOutlineRowLayout>>(NO_ROW_LAYOUTS);
  const [viewportHeight, setViewportHeight] = useState(0);
  // 读者一滚就停跟随，否则列表会从他脚下抽走；跳转后恢复。
  const [isFollowing, setIsFollowing] = useState(true);
  const programmaticScrollUntilRef = useRef(0);
  const lastUserScrollAtRef = useRef(0);
  // 测量一行会重跑跟随副作用的逻辑；目标没变就不该重新开始滚动。
  const lastScrollTargetRef = useRef<number | null>(null);
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

  // 没有这个，一次滚轮轻碰就让栏停整个会话，高亮还在动、列表不动。
  useEffect(() => {
    if (isFollowing || activeSeq === null) return;
    if (Date.now() - lastUserScrollAtRef.current < FOLLOW_RESUME_DELAY_MS) return;
    // 忘掉上一个目标：新行可能与栏停下那行共用偏移，不能算已滚到。
    lastScrollTargetRef.current = null;
    setIsFollowing(true);
  }, [activeSeq, isFollowing]);

  // 行高来自实测的盒子，不是 `index * lineHeight`：行会截到四行，
  // 行之间带序号的分隔也属于同一段内容流。
  useEffect(() => {
    if (!isFollowing || activeSeq === null) return;
    const layout = rowLayouts.get(activeSeq);
    if (!layout) return;
    // 还没测量过的视口照样能滚：把行的顶边对齐，
    // 总比让高亮停在屏幕外好。
    const target = Math.max(
      0,
      viewportHeight === 0 ? layout.y : layout.y + layout.height / 2 - viewportHeight / 2,
    );
    if (lastScrollTargetRef.current === target) return;
    lastScrollTargetRef.current = target;
    programmaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
    // 瞬时滚：平滑动画的尾巴会在窗口之后到达，被当成读者在滚。
    scrollRef.current?.scrollTo({
      y: target,
      animated: false,
    });
  }, [activeSeq, isFollowing, rowLayouts, viewportHeight]);

  const handleJumpToPrompt = useCallback(
    (seq: number) => {
      setIsFollowing(true);
      onJumpToPrompt(seq);
    },
    [onJumpToPrompt],
  );

  // 每一行的回调在这里一次算好：直接写在 JSX 属性里会触发
  // jsx-no-new-function-as-prop，而列表项自己不值得再拆一个组件。
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
        onPress: () => handleJumpToPrompt(prompt.seq),
        onLayout: (event: LayoutChangeEvent) => {
          const { y, height } = event.nativeEvent.layout;
          handleRowMeasure(prompt.seq, { y, height });
        },
      })),
    [prompts, activeSeq, handleJumpToPrompt, handleRowMeasure, t],
  );

  return (
    <View
      style={[styles.rail, inlineUnistylesStyle({ width })]}
      role="tablist"
      testID="chat-outline-text-rail"
    >
      <View style={styles.header}>
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
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          onLayout={handleListLayout}
          onScroll={handleListScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleListScrollBeginDrag}
          testID="chat-outline-text-list"
        >
          {rows.map((row) => (
            <Fragment key={row.key}>
              <ChatOutlineTextSeparator index={row.index} seq={row.seq} />
              <PressHighlight
                style={styles.row}
                onLayout={row.onLayout}
                onPress={row.onPress}
                accessibilityRole="tab"
                aria-selected={row.isActive}
                accessibilityLabel={row.label}
                testID={`chat-outline-text-row-${row.seq}`}
              >
                <Text
                  style={[styles.label, row.isActive && styles.labelActive]}
                  numberOfLines={TEXT_ROW_MAX_LINES}
                >
                  {row.text}
                </Text>
              </PressHighlight>
            </Fragment>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  rail: {
    position: "absolute",
    left: theme.spacing[2],
    top: "10%",
    bottom: "10%",
    zIndex: 2,
  },
  // 朝向转录而不是面板外缘，栏才读起来像聊天的一部分。
  header: {
    alignItems: "flex-end",
  },
  scroll: {
    flex: 1,
  },
  row: {
    justifyContent: "center",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
  },
  // 用主题前景色对，与所有列表的选中态一致；换色相要为每种配色各挑一次。
  label: {
    fontSize: theme.fontSize.base,
    lineHeight: TEXT_ROW_LINE_HEIGHT,
    color: theme.colors.foregroundMuted,
  },
  labelActive: {
    color: theme.colors.foreground,
  },
}));
