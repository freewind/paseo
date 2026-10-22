/**
 * Limits for the navigation state a client persists on the daemon.
 *
 * The daemon stores what the client sends without understanding it, so these caps are the only
 * thing keeping one client's bookkeeping from growing the file without bound.
 */
export const NAVIGATION_RECENT_VISITS_MAX = 20;
export const NAVIGATION_STACK_MAX_ENTRIES = 100;
export const NAVIGATION_DEVICE_KEY_MAX_CHARS = 128;
export const NAVIGATION_DEVICE_MAX_COUNT = 8;
