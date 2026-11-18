import { createContext, useCallback, useContext } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CONTROL_HEIGHTS, HEADER_CONTROL_HEIGHT } from "@/components/ui/control-geometry";
import { ICON_SIZE } from "@/styles/theme";

export { extraMutedIconColorMapping, mutedIconColorMapping } from "@/components/ui/icon-color";

export type IconButtonChromeSize = "large" | "small";

const SMALL_ICON_BUTTON_SIZE = 20;
/** Width and height of a large icon button on compact layouts. */
export const COMPACT_LARGE_ICON_BUTTON_SIZE = 32;
const COMPACT_SMALL_ICON_BUTTON_SIZE = 32;
/**
 * The composer track draws its controls at the height of the pills they sit beside, icon buttons
 * included. A row where one control is a 32px pill and its neighbour is a 20px glyph has no rail
 * for the eye to follow, and a 20px box is not a finger target.
 */
const COMPOSER_TRACK_CONTROL_SIZE = CONTROL_HEIGHTS.compact;

export interface IconButtonChromeState {
  hovered?: boolean;
  pressed?: boolean;
  open?: boolean;
  active?: boolean;
}

function resolveIconButtonFrame(
  size: IconButtonChromeSize,
  compact: boolean,
  framed = false,
): StyleProp<ViewStyle> {
  // An icon action that stands beside the track's pills is a peer control, not a glyph inside a
  // toolbar, so it takes the pills' height and chrome. Only the small icon action can be framed.
  if (framed && size === "small") return styles.composerTrack;
  if (size === "large") return styles.large;
  return compact ? styles.smallCompact : styles.small;
}

interface IconButtonChromeOptions {
  size: IconButtonChromeSize;
  state?: IconButtonChromeState;
  compact?: boolean;
  disabled?: boolean;
  /** A circular hitbox and highlight, for buttons inside a pill-shaped container. */
  round?: boolean;
  /** Draws the composer track's pill chrome instead of a bare glyph box. */
  framed?: boolean;
  style?: StyleProp<ViewStyle>;
}

const IconButtonChromeContext = createContext<"default" | "header-island">("default");

/** A container owns the chrome of its icon actions, including custom menu and badge triggers. */
export const IconButtonChromeProvider = IconButtonChromeContext.Provider;

/** The same state callback works with Pressable, TooltipTrigger, and DropdownMenuTrigger. */
export function useIconButtonChromeStyle({
  size,
  compact,
  disabled,
  round,
  framed,
  style,
  active,
}: Omit<IconButtonChromeOptions, "state"> & { active?: boolean }) {
  const scope = useContext(IconButtonChromeContext);
  return useCallback(
    (state: IconButtonChromeState) =>
      iconButtonChromeStyle({
        size: scope === "header-island" ? "large" : size,
        compact,
        disabled,
        round: scope === "header-island" || round,
        framed,
        style,
        state: { ...state, active: active || state.active },
      }),
    [scope, size, compact, disabled, round, framed, style, active],
  );
}

/** Shared hitbox and interaction chrome for icon-only header and toolbar controls. */
export function iconButtonChromeStyle({
  size,
  state,
  compact = false,
  disabled = false,
  round = false,
  framed = false,
  style,
}: IconButtonChromeOptions): StyleProp<ViewStyle> {
  const highlighted = state?.active || state?.hovered || state?.pressed || state?.open;
  return [
    resolveIconButtonFrame(size, compact, framed),
    round ? styles.round : null,
    style,
    highlighted ? styles.highlighted : null,
    disabled ? styles.disabled : null,
  ];
}

/** Frame-only form for non-interactive placeholders that must preserve header alignment. */
export function iconButtonChromeFrameStyle(
  size: IconButtonChromeSize,
  compact = false,
): StyleProp<ViewStyle> {
  return resolveIconButtonFrame(size, compact);
}

export function iconButtonChromeGlyphSize(size: IconButtonChromeSize, compact = false): number {
  if (size === "large") return ICON_SIZE.md;
  return compact ? 18 : 14;
}

export function smallIconButtonChromeFrameSize(compact = false): number {
  return compact ? COMPACT_SMALL_ICON_BUTTON_SIZE : SMALL_ICON_BUTTON_SIZE;
}

const styles = StyleSheet.create((theme) => ({
  large: {
    width: {
      xs: COMPACT_LARGE_ICON_BUTTON_SIZE,
      md: HEADER_CONTROL_HEIGHT,
    },
    height: {
      xs: COMPACT_LARGE_ICON_BUTTON_SIZE,
      md: HEADER_CONTROL_HEIGHT,
    },
    padding: 0,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  small: {
    width: SMALL_ICON_BUTTON_SIZE,
    height: SMALL_ICON_BUTTON_SIZE,
    padding: 0,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  smallCompact: {
    width: COMPACT_SMALL_ICON_BUTTON_SIZE,
    height: COMPACT_SMALL_ICON_BUTTON_SIZE,
    padding: 0,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  // The pill's own chrome (composer/pill-styles.ts), because a framed icon action is a pill whose
  // label is an icon. Same height, radius, border, and surface, so the row reads as one rail.
  composerTrack: {
    width: COMPOSER_TRACK_CONTROL_SIZE,
    height: COMPOSER_TRACK_CONTROL_SIZE,
    padding: 0,
    borderRadius: theme.borderRadius["2xl"],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  round: {
    borderRadius: theme.borderRadius.full,
  },
  highlighted: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
}));
