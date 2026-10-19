import React, { createContext, memo, type ReactNode, useContext, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const RetainedPanelActiveContext = createContext(true);

export function useRetainedPanelActive(): boolean {
  return useContext(RetainedPanelActiveContext);
}

/**
 * Clears overlay state a retained panel owns when that panel goes inactive.
 *
 * The reset runs during render, not from an effect, because it has to land in the
 * inactive commit itself. On web the chat suspends one commit later, and an update
 * queued from an effect would be suspended with it: the surface would keep painting
 * its backdrop over whatever the user navigated to, and would reopen on return.
 *
 * Only pass setters of the component calling this hook. Updating another component
 * during render is not allowed.
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
 * Renders its children only while the surrounding retained panel is active. Use it
 * around a surface that renders outside the panel (portal, app-wide sheet stack).
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
