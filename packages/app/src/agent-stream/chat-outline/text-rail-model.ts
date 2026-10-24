/** 单开一个文件，是因为 `./model` 要保持上游原样，圆点栏也用不到这些。 */

export interface ChatOutlineRowLayout {
  y: number;
  height: number;
}

export const TEXT_RAIL_GUTTER_PADDING = 12;

/** 挡住粘贴进来的长文件；整行数好喂给 `numberOfLines`。 */
export const TEXT_ROW_MAX_LINES = 4;
export const TEXT_ROW_LINE_HEIGHT = 20;

/** 窄列里空行只换来空白高度，所以每条提示都压成一段。 */
export function collapsePromptWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 面板按内容列居中，两侧剩下的缝就是这个宽度。
 *
 * 返回 `null` 只说明「没有侧缝」（面板还没量出宽度，或内容列已经把宽度吃干净），
 * 不代表调用方该整条不显示——要不要显示、显示多宽，由调用方按自己的取舍决定：
 * - 文字栏与右侧常驻面板：侧缝不够时改用按钮打开弹层，不压住内容列。
 */
export function resolveSideRailWidth(panelWidth: number, contentMaxWidth: number): number | null {
  if (!(panelWidth > 0) || !(contentMaxWidth > 0)) return null;
  const available = (panelWidth - contentMaxWidth) / 2 - TEXT_RAIL_GUTTER_PADDING;
  return available > 0 ? available : null;
}
