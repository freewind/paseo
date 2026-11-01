/**
 * 客户端持久化到 daemon 的导航状态上限。
 *
 * daemon 只存不理解：这些上限是唯一能阻止一个客户端的记账把文件撑大的东西。
 */
export const NAVIGATION_RECENT_VISITS_MAX = 20;
export const NAVIGATION_STACK_MAX_ENTRIES = 100;
export const NAVIGATION_DEVICE_KEY_MAX_CHARS = 128;
export const NAVIGATION_DEVICE_MAX_COUNT = 8;
