import React, { useEffect, useRef, useState, type ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import {
  PROMPT_DETAIL_GAP,
  PROMPT_DETAIL_MAX_HEIGHT,
  PROMPT_DETAIL_WIDTH,
  type ChatOutlinePrompt,
} from "./model";
// An extension-qualified import is required here: `./prompt-detail` resolves back to this
// platform file on web and creates a self-import.
const { PromptDetailContent } = require("./prompt-detail.tsx") as typeof import("./prompt-detail");

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureElement(element: View): Promise<Rect> {
  return new Promise((resolve) => {
    element.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

/** Window measurements must be converted to the panel's local coordinate system. */
function computePopoverPosition(rowRect: Rect, panelRect: Rect) {
  if (panelRect.width <= 0 || panelRect.height <= 0) return null;
  const width = Math.min(PROMPT_DETAIL_WIDTH, panelRect.width);
  const maxHeight = Math.min(PROMPT_DETAIL_MAX_HEIGHT, panelRect.height);
  const left = Math.min(
    Math.max(0, rowRect.x - panelRect.x - width - PROMPT_DETAIL_GAP),
    panelRect.width - width,
  );
  const top = Math.min(Math.max(0, rowRect.y - panelRect.y), panelRect.height - maxHeight);
  return { left, top, width, maxHeight };
}

interface PromptDetailPopoverProps {
  prompt: ChatOutlinePrompt;
  index: number;
  total: number;
  onRequestPromptText: (seq: number) => Promise<string | null>;
  rowRef: React.RefObject<View | null>;
  panelRef: React.RefObject<View | null>;
  onJumpToPrompt: (seq: number) => void;
  onClose: () => void;
}

/** The body preserves the original prompt's whitespace; only the outline rows collapse it. */
export function PromptDetailPopover({
  prompt,
  index,
  total,
  onRequestPromptText,
  rowRef,
  panelRef,
  onJumpToPrompt,
  onClose,
}: PromptDetailPopoverProps): ReactElement | null {
  const [frame, setFrame] = useState<ReturnType<typeof computePopoverPosition>>(null);
  const measureEpoch = useRef(0);

  useEffect(() => {
    const request = measureEpoch;
    const epoch = ++request.current;
    const row = rowRef.current;
    const panel = panelRef.current;
    if (!row || !panel) return undefined;
    void Promise.all([measureElement(row), measureElement(panel)]).then(([rowRect, panelRect]) => {
      if (request.current === epoch) setFrame(computePopoverPosition(rowRect, panelRect));
      return null;
    });
    return () => {
      request.current++;
    };
  }, [panelRef, prompt.seq, rowRef]);

  // Mount only after measurement, so no frame paints at an unmeasured position.
  if (!frame) return null;

  return (
    <PromptDetailContent
      prompt={prompt}
      index={index}
      total={total}
      onRequestPromptText={onRequestPromptText}
      onJumpToPrompt={onJumpToPrompt}
      onClose={onClose}
      style={[styles.popover, inlineUnistylesStyle(frame)]}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  // A panel-local sibling stays above the rail without escaping the chat's lifecycle.
  popover: {
    position: "absolute",
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    zIndex: 3,
    ...theme.shadow.md,
  },
}));
