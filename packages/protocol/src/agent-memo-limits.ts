export const AGENT_MEMO_MAX_CHARS = 2000;

export const AGENT_MEMOS_MAX_PER_AGENT = 20;

/**
 * Memo images are inline base64, so an unbounded one would grow `agent-memos.json` without
 * limit. The app encodes what the user pasted, so this cap is the reject point, not a hint.
 */
export const AGENT_MEMO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Keeps one memo from carrying an album; the rail renders a single thumbnail row. */
export const AGENT_MEMO_MAX_IMAGES = 4;
