import type { AgentTimelinePromptIndexPayload } from "@getpaseo/client/internal/daemon-client";

export type ChatOutlinePrompt = AgentTimelinePromptIndexPayload["prompts"][number];

export function shouldAcceptPromptIndexEpoch(timelineEpoch: string, indexEpoch: string): boolean {
  return timelineEpoch === indexEpoch;
}

/**
 * The transcript's content column is centred, so the space beside it is
 * `(panel - content) / 2`. The text outline lives in that gutter rather than
 * over the transcript, mirrored on the left edge.
 */
export const TEXT_RAIL_MIN_WIDTH = 120;

/**
 * The gutter grows without limit on a wide window, and a single line of prompt
 * text stretched across half the screen reads worse than one that stops. Capping
 * keeps the outline a marginal note beside the conversation.
 */
export const TEXT_RAIL_MAX_WIDTH = 360;

/** Breathing room between the panel edge and the first character. */
export const TEXT_RAIL_GUTTER_PADDING = 12;

/**
 * A prompt row shows a few lines of the prompt, capped so one pasted file cannot own
 * the rail. The cap is a whole line count so it can drive `numberOfLines`: a partial
 * line would need a pixel cap and its own scroller again, and the scroller is exactly
 * what this rail removed — the list is the only thing the wheel may scroll. What the
 * cap hides lives in the detail popover a click opens instead.
 */
export const TEXT_ROW_LINE_HEIGHT = 20;
export const TEXT_ROW_MAX_LINES = 4;

/**
 * The detail popover keeps the same width budget as the rail itself, so widening the
 * popover is a decision about the layout, not a side effect of opening it.
 */
export const PROMPT_DETAIL_WIDTH = 360;

/**
 * Past this height a popover stops reading like a note and starts covering the outline
 * it sprang from, so the body scrolls inside while the actions stay pinned below it.
 */
export const PROMPT_DETAIL_MAX_HEIGHT = 360;

/** Gap between the popover and the rail, so the popover reads as attached to its row. */
export const PROMPT_DETAIL_GAP = 8;

/**
 * The rail lays a prompt out as one paragraph. Blank lines and hard wraps only buy empty
 * height in a narrow column the reader is scanning, so any run of whitespace — newlines
 * included — becomes a single space. The daemon collapses its 120-character preview the
 * same way; this keeps the full text it sends consistent with that preview.
 */
export function collapsePromptWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Width available to the text outline, or `null` when the panel has not been
 * measured yet or the gutter is too narrow to show a readable line. A `null`
 * means the outline is not shown at all: the column never squeezes it down to
 * a sliver, and nothing else takes its place.
 */
export function resolveTextRailWidth(panelWidth: number, contentMaxWidth: number): number | null {
  if (!(panelWidth > 0) || !(contentMaxWidth > 0)) return null;
  const available = (panelWidth - contentMaxWidth) / 2 - TEXT_RAIL_GUTTER_PADDING;
  if (available < TEXT_RAIL_MIN_WIDTH) return null;
  return Math.min(available, TEXT_RAIL_MAX_WIDTH);
}

/**
 * The prompt whose turn the reader is inside: the last indexed prompt at or before the
 * timeline position under the top of the viewport. It reads the complete daemon index,
 * so a prompt outside the loaded window still lights up while its turn is on screen.
 */
export function resolveActivePromptSeq(
  prompts: readonly ChatOutlinePrompt[],
  anchorSeq: number | null,
): number | null {
  if (anchorSeq === null) {
    return null;
  }
  let activeSeq: number | null = null;
  for (const prompt of prompts) {
    if (prompt.seq > anchorSeq) {
      break;
    }
    activeSeq = prompt.seq;
  }
  return activeSeq;
}

export interface ActivePromptSource {
  subscribe: (listener: () => void) => () => void;
  getActiveSeq: () => number | null;
}

export interface ActivePromptPublisher extends ActivePromptSource {
  publish: (seq: number | null) => void;
}

/**
 * The transcript reports its reading position on every scroll frame, far more often than
 * it re-renders. Keeping the active prompt outside React lets the rail subscribe to it
 * without dragging the transcript through a render on each frame.
 */
export function createActivePromptPublisher(): ActivePromptPublisher {
  const listeners = new Set<() => void>();
  let activeSeq: number | null = null;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getActiveSeq: () => activeSeq,
    publish(seq) {
      if (seq === activeSeq) {
        return;
      }
      activeSeq = seq;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
