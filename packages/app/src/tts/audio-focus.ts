/**
 * Web has no equivalent of a platform audio-focus loss: the browser stops a speech utterance
 * when the page loses the floor, so there is nothing to watch.
 */
export function observeAudioFocusLoss(_onLost: () => void): () => void {
  return () => undefined;
}
