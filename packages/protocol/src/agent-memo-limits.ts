export const AGENT_MEMO_MAX_CHARS = 2000;

export const AGENT_MEMOS_MAX_PER_AGENT = 20;

/**
 * Memo images are inline base64, so an unbounded one would grow `agent-memos.json` without
 * limit. The app encodes what the user pasted, so this cap is the reject point, not a hint.
 */
export const AGENT_MEMO_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Keeps one memo from carrying an album; the rail renders a single thumbnail row. */
export const AGENT_MEMO_MAX_IMAGES = 4;

/**
 * Total base64 bytes one agent's memos may hold. Images are inlined into `agent-memos.json`,
 * and the daemon re-serializes the whole file on every memo write, so a per-image cap alone
 * still lets one agent's file grow to hundreds of megabytes.
 */
export const AGENT_MEMO_IMAGES_TOTAL_MAX_BYTES = 32 * 1024 * 1024;
