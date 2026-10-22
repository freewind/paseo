import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, X } from "lucide-react-native";
import { isWeb } from "@/constants/platform";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveIconMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const accentIconMapping = (theme: Theme) => ({ color: theme.colors.accent });
const ThemedCancelX = withUnistyles(X, mutedIconMapping);
const ThemedConfirmCheck = withUnistyles(Check, mutedIconMapping);
const ThemedConfirmCheckDestructive = withUnistyles(Check, destructiveIconMapping);
const ThemedConfirmCheckAccent = withUnistyles(Check, accentIconMapping);

/**
 * Confirm in place: the trigger is replaced by a cancel and a confirm button on the same spot,
 * so a lightweight action never leaves the surface it started from.
 *
 * This is not a replacement for `confirmDialog`. That one asks the platform (Alert on iOS and
 * Android, the desktop dialog, `window.confirm` on the web) and is right for a destructive or
 * irreversible action the user should read twice. Use this when the question is small, the
 * trigger already says what will happen, and a system dialog would only interrupt.
 */
export function InlineConfirm({
  children,
  triggerLabel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  accent = false,
  iconSize = ICON_SIZE.sm,
  disabled = false,
  triggerStyle,
  testID,
  open,
  onOpenChange,
}: {
  /** The collapsed trigger's content; the whole trigger is the button. */
  children: ReactNode;
  triggerLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Paints the confirm check in the destructive color. */
  destructive?: boolean;
  /** Paints the confirm check in the accent color, for a confirm that is not destructive. */
  accent?: boolean;
  iconSize?: number;
  disabled?: boolean;
  triggerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** Controlled form: the caller decides when the question appears, e.g. after a press elsewhere. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const containerRef = useRef<View | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (open === undefined) setUncontrolledOpen(next);
    },
    [onOpenChange, open],
  );

  const handlePressTrigger = useCallback(() => setOpen(true), [setOpen]);
  const cancel = useCallback(() => setOpen(false), [setOpen]);
  const confirm = useCallback(() => {
    setOpen(false);
    onConfirm();
  }, [onConfirm, setOpen]);

  // Web has no surface to dismiss this for us: a click elsewhere or Escape puts the trigger back.
  // Native rows are short-lived and the explicit Cancel is the way out, so no listener is needed.
  useEffect(() => {
    if (!isWeb || !isOpen) return;
    const element = containerRef.current as unknown as HTMLElement | null;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (element && target instanceof Node && element.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, setOpen]);

  if (!isOpen) {
    return (
      <Pressable
        ref={containerRef}
        onPress={handlePressTrigger}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        testID={testID}
        style={triggerStyle}
        hitSlop={6}
      >
        {children}
      </Pressable>
    );
  }

  let confirmIcon = <ThemedConfirmCheck size={iconSize} />;
  if (accent) {
    confirmIcon = <ThemedConfirmCheckAccent size={iconSize} />;
  } else if (destructive) {
    confirmIcon = <ThemedConfirmCheckDestructive size={iconSize} />;
  }

  return (
    <View ref={containerRef} style={styles.row}>
      <Pressable
        onPress={cancel}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        testID={testID ? `${testID}-cancel` : undefined}
        style={styles.button}
        hitSlop={6}
      >
        <ThemedCancelX size={iconSize} />
      </Pressable>
      <Pressable
        onPress={confirm}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        testID={testID ? `${testID}-confirm` : undefined}
        style={styles.button}
        hitSlop={6}
      >
        {confirmIcon}
      </Pressable>
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
}));
