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

/** 面板按内容列居中，大纲就住它两侧的缝里；缝太窄就整条不显示。 */
export function resolveSideRailWidth(panelWidth: number, contentMaxWidth: number): number | null {
  if (!(panelWidth > 0) || !(contentMaxWidth > 0)) return null;
  const available = (panelWidth - contentMaxWidth) / 2 - TEXT_RAIL_GUTTER_PADDING;
  return available > 0 ? available : null;
}
