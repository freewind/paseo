import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, X } from "lucide-react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import { isWeb } from "@/constants/platform";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveIconMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const ThemedCancelX = withUnistyles(X, mutedIconMapping);
const ThemedConfirmCheck = withUnistyles(Check, mutedIconMapping);
const ThemedConfirmCheckDestructive = withUnistyles(Check, destructiveIconMapping);

/**
 * 原位确认：点一下，触发点原地换成「取消 / 确认」两个图标按钮，轻量操作不必离开当前界面。
 *
 * 它不是 confirmDialog 的替代。confirmDialog 走平台弹窗（iOS/Android 的 Alert、桌面对话框、
 * web 的 window.confirm），适合需要读两遍的破坏性、不可逆操作；这里用在问题很小、触发点本身
 * 已经说明会发生什么、不值得打断操作的地方。
 */
export function InlineConfirm({
  children,
  onConfirm,
  destructive = false,
  triggerStyle,
  testID,
}: {
  /** 收起状态下触发点的内容；整个触发点就是按钮。 */
  children: ReactNode;
  onConfirm: () => void;
  /** 把确认图标画成破坏性颜色。 */
  destructive?: boolean;
  triggerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<View | null>(null);

  const handlePressTrigger = useCallback(() => setIsOpen(true), []);
  const cancel = useCallback(() => setIsOpen(false), []);
  const confirm = useCallback(() => {
    setIsOpen(false);
    onConfirm();
  }, [onConfirm]);

  // web 没有替我们关掉这个状态的表面：点到别处或按 Escape 就收起。native 的行本身很短命，
  // 显式点取消就是出口，不需要监听。
  useEffect(() => {
    if (!isWeb || !isOpen) return;
    const element = containerRef.current as unknown as HTMLElement | null;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (element && target instanceof Node && element.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) {
    return (
      <PressHighlight
        ref={containerRef}
        onPress={handlePressTrigger}
        testID={testID}
        style={triggerStyle}
        highlightStyle={styles.triggerPressed}
        hitSlop={6}
      >
        {children}
      </PressHighlight>
    );
  }

  const confirmIcon = destructive ? (
    <ThemedConfirmCheckDestructive size={ICON_SIZE.sm} />
  ) : (
    <ThemedConfirmCheck size={ICON_SIZE.sm} />
  );

  return (
    <View ref={containerRef} style={styles.row}>
      <PressHighlight
        onPress={cancel}
        testID={testID ? `${testID}-cancel` : undefined}
        style={styles.button}
        highlightStyle={styles.pressed}
        hitSlop={6}
      >
        <ThemedCancelX size={ICON_SIZE.sm} />
      </PressHighlight>
      <PressHighlight
        onPress={confirm}
        testID={testID ? `${testID}-confirm` : undefined}
        style={styles.button}
        highlightStyle={styles.pressed}
        hitSlop={6}
      >
        {confirmIcon}
      </PressHighlight>
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  button: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  // 按下反馈的圆角由 PressHighlight 从 button 自身的 style 复制，这里只决定填充色。
  pressed: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  // 触发点的默认按下反馈：圆角给一个保守值，形状不规则的触发点自己在 triggerStyle 里声明圆角。
  triggerPressed: {
    backgroundColor: theme.colors.interactionHighlight,
    borderRadius: theme.borderRadius.md,
  },
}));
