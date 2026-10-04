import type { AgentTimelinePromptIndexPayload } from "@getpaseo/client/internal/daemon-client";

export type ChatOutlinePrompt = AgentTimelinePromptIndexPayload["prompts"][number];

export function shouldAcceptPromptIndexEpoch(timelineEpoch: string, indexEpoch: string): boolean {
  return timelineEpoch === indexEpoch;
}

/**
 * Slots further than this from the pointer keep their resting size, so a long rail
 * magnifies a local band instead of swelling the whole column.
 */
export const OUTLINE_MAGNIFY_RADIUS = 3;

/**
 * Dock-style falloff: 1 under the pointer, easing to 0 at the radius. The raised cosine
 * has no corner at either end, so sweeping the rail reads as one bulge travelling with
 * the pointer rather than a band switching on and off.
 */
export function promptTickMagnification(slotDistance: number): number {
  const distance = Math.abs(slotDistance);
  if (!Number.isFinite(distance) || distance >= OUTLINE_MAGNIFY_RADIUS) {
    return 0;
  }
  return (1 + Math.cos((Math.PI * distance) / OUTLINE_MAGNIFY_RADIUS)) / 2;
}

/**
 * The transcript's content column is centred, so the space beside it is
 * `(panel - content) / 2`. The text outline lives in that gutter rather than
 * over the transcript.
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
 * Width available to the text outline, or `null` when the panel has not been
 * measured yet or the gutter is too narrow to show a readable line. A `null`
 * tells the caller to fall back to the dot rail; it never hides the outline,
 * because a long conversation is exactly when navigation matters most.
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
