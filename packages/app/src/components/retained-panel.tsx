import React, { createContext, memo, type ReactNode, useContext, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const RetainedPanelActiveContext = createContext(true);

export function useRetainedPanelActive(): boolean {
  return useContext(RetainedPanelActiveContext);
}

/**
 * 保留面板失活时，清掉它自己持有的浮层状态。
 *
 * 重置发生在渲染期间，而不是在 effect 里：它必须在失活那一次提交里落地。web 上 chat 会晚
 * 一个 commit 才挂起，effect 里排队的更新会跟着一起被挂起，浮层就会带着遮罩留在用户切过去
 * 的页面上，回来时还会重新弹开。
 *
 * 用 ref 记住上一次是不是活跃，重置只在活跃转失活的那一次触发。reset 不只是关掉开关，还会清掉
 * 用户填了一半的内容（mode-control 的 reset 连搜索词一起清空），所以不能让它跟着每次渲染重跑。
 *
 * 只能传调用方自己的 setter。在渲染期间更新其它组件的状态是不允许的，因此没有一处集中的清理
 * 兜底：每个持有浮层状态的组件都得在自己的渲染里调一次这个 hook，漏掉的那个浮层会一直留在
 * 屏幕上。
 */
export function useResetWhenPanelInactive(reset: () => void): void {
  const active = useRetainedPanelActive();
  const wasActiveRef = useRef(active);
  if (active) {
    wasActiveRef.current = true;
    return;
  }
  if (wasActiveRef.current) {
    wasActiveRef.current = false;
    reset();
  }
}

/**
 * 只在所属保留面板活跃时渲染 children。用在渲染到面板之外的浮层上（portal、全局 sheet 栈）。
 *
 * 三条都满足才需要套这层 gate：
 * 1. 由面板内部的控件打开；
 * 2. 渲染到面板之外，面板的 display: none 关不住它；
 * 3. 面板失活后它还会留在屏幕上，切回来时又会重新弹开。
 *
 * 所以 tooltip、hover-card、menu、autocomplete、toast、command-center 保持原样：tooltip 与 menu
 * 在各自组件里读面板活跃度自行关闭，hover-card 靠指针移出收起，autocomplete 的显隐由调用方传入，
 * toast 与 command-center 不属于任何面板。
 *
 * 这里是不渲染，不是隐藏：面板失活时被包住的浮层整棵卸载，它里面的临时状态（表单草稿、搜索词）
 * 会一起丢掉。
 */
export function RetainedPanelGate({ children }: { children?: ReactNode }): ReactNode {
  return useRetainedPanelActive() ? children : null;
}

interface RetainedPanelProps {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface RetainedPanelActivityProps {
  active: boolean;
  children: ReactNode;
}

export function RetainedPanelActivity({ active, children }: RetainedPanelActivityProps) {
  const parentActive = useRetainedPanelActive();
  return (
    <RetainedPanelActiveContext value={parentActive && active}>
      {children}
    </RetainedPanelActiveContext>
  );
}

/**
 * Keeps expensive panel state mounted without letting an inactive panel render
 * on screen. The stable, non-collapsible native root is intentional: retained
 * panels must not detach or reparent their native descendants when visibility
 * changes.
 */
export const RetainedPanel = memo(function RetainedPanel({
  active,
  children,
  style,
  testID,
}: RetainedPanelProps) {
  const visibleStyle = StyleSheet.compose<ViewStyle, ViewStyle, ViewStyle>(styles.root, style);
  const panelStyle = active
    ? visibleStyle
    : StyleSheet.compose<ViewStyle, ViewStyle, ViewStyle>(visibleStyle, styles.hidden);

  return (
    <RetainedPanelActivity active={active}>
      <View
        collapsable={false}
        pointerEvents={active ? "auto" : "none"}
        style={panelStyle}
        testID={testID}
      >
        {children}
      </View>
    </RetainedPanelActivity>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
});
