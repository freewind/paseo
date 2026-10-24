import { useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function SideRailSheetTrigger({
  icon: Icon,
  accessibilityLabel,
  onPress,
  testID,
}: {
  icon: LucideIcon;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}) {
  const ThemedIcon = useMemo(() => withUnistyles(Icon, mutedIconMapping), [Icon]);
  return (
    <ToolbarButton label={accessibilityLabel} onPress={onPress} testID={testID}>
      <ThemedIcon size={ICON_SIZE.md} uniProps={mutedIconMapping} />
    </ToolbarButton>
  );
}

export function SideRailSheet({
  accessibilityLabel,
  visible,
  onClose,
  children,
  scrollable = false,
}: {
  accessibilityLabel: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
}) {
  const header = useMemo(() => ({ title: accessibilityLabel }), [accessibilityLabel]);
  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      desktopHeight="65%"
      scrollable={scrollable}
    >
      {children}
    </AdaptiveModalSheet>
  );
}
