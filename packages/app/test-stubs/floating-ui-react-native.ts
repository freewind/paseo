/**
 * Test double for `@floating-ui/react-native`.
 *
 * The real CJS entry `require`s `react-native`, whose entry ships untranspiled Flow
 * (`import typeof`), which nothing in the Node test runtime can parse. The combobox only
 * needs `useFloating` to return the three refs and a floating-styles-shaped object; no test
 * asserts real floating positioning.
 */
export function useFloating(options?: Record<string, unknown>) {
  void options;
  return {
    x: 0,
    y: 0,
    placement: "bottom",
    strategy: "absolute",
    middlewareData: {},
    isPositioned: false,
    floatingStyles: { position: "absolute" as const, top: "0", left: "0" },
    refs: {
      reference: { current: null },
      floating: { current: null },
      offsetParent: { current: null },
      setReference: () => {},
      setFloating: () => {},
      setOffsetParent: () => {},
      positionReference: { current: null },
    },
    elements: { reference: null, floating: null, offsetParent: null, domReference: null },
    update: () => {},
  };
}

export const arrow = () => ({ fn: () => ({}), name: "arrow" });
export const autoPlacement = () => ({ name: "autoPlacement" });
export const flip = () => ({ name: "flip" });
export const hide = () => ({ name: "hide" });
export const inline = () => ({ name: "inline" });
export const limitShift = () => ({ name: "limitShift" });
export const offset = () => ({ name: "offset" });
export const shift = () => ({ name: "shift" });
export const size = () => ({ name: "size" });
export const computePosition = async () => ({
  x: 0,
  y: 0,
  placement: "bottom",
  strategy: "absolute",
  middlewareData: {},
});
export { useFloating as default };
