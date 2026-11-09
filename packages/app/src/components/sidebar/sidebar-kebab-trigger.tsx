import { type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MoreVertical } from "lucide-react-native";
import { densityIconProps } from "@/styles/density";
import type { Theme } from "@/styles/theme";

/**
 * The kebab at the end of a sidebar row. Workspace rows and agent rows share this one
 * definition: the two used to render different icons at different sizes, so a row that
 * swapped its trailing content changed the button under the pointer.
 */

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const ThemedMoreVertical = withUnistyles(MoreVertical);

const triggerIconProps = densityIconProps("sm", foregroundMutedColorMapping);
const triggerIconHoveredProps = densityIconProps("sm", foregroundColorMapping);

export function renderSidebarKebabIcon({ hovered }: { hovered?: boolean }) {
  return <ThemedMoreVertical uniProps={hovered ? triggerIconHoveredProps : triggerIconProps} />;
}

export function sidebarKebabTriggerStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, hovered && styles.triggerHovered];
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    // Larger on compact so the kebab is an easy tap target.
    width: { xs: 32, md: 18 },
    height: { xs: 32, md: 18 },
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    marginLeft: 2,
    // Center the compact box on the 20px title line it is anchored to.
    marginTop: { xs: -6, md: 0 },
    // MoreVertical paints only around the center of its SVG. Keep the padded hit box, but
    // pull the painted dots through that unused view-box space onto the trailing-content rail.
    marginRight: { xs: -14, md: -7 },
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
