export const AGENT_MEMO_MAX_CHARS = 2000;

export const AGENT_MEMOS_MAX_PER_AGENT = 20;

/**
 * 备忘图片是内联 base64，不设上限会让 `agent-memos.json` 无限增长。编码由应用侧完成，
 * 所以这个上限是拒收线，不是给用户看的提示。
 */
export const AGENT_MEMO_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** 防止一条备忘塞进整本相册；右侧常驻栏只渲染一行缩略图。 */
export const AGENT_MEMO_MAX_IMAGES = 4;

/**
 * 单个 agent 的备忘图片 base64 总量。图片内联在 `agent-memos.json` 里，而 daemon 每次
 * 写入都会重新序列化整个文件，所以只卡单图大小，一个 agent 的文件仍能涨到几百 MB。
 */
export const AGENT_MEMO_IMAGES_TOTAL_MAX_BYTES = 32 * 1024 * 1024;
