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
 * 只能传调用方自己的 setter。在渲染期间更新其它组件的状态是不允许的。
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
