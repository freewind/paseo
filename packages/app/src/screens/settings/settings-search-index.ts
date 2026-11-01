import type { MatchRange } from "@getpaseo/protocol/search/text-match";
import { scoreTextFields } from "@getpaseo/protocol/search/text-match";
import { i18n } from "@/i18n/i18next";
import { findHighlightRanges } from "@/components/ui/highlighted-text-segments";
import type { SettingsSectionSlug } from "@/utils/host-routes";

/**
 * 设置侧栏的跨路由索引：每个设置行记下"它所在的分区"，以及"文案的 i18n key"。文案在搜索时
 * 才用 `t()` 解析，所以任何语言都能搜，改文案也不会让索引失效。
 *
 * 索引与各分区组件要手工保持同步：新加的行没登记就搜不到，typecheck 也发现不了；
 * 分区标题本身由侧栏列表按标题匹配兜住，不写在这里。插件的宿主分区不在此列——它的
 * 行来自插件清单，只能按分区标题匹配。
 */
export interface SettingsSearchSection {
  section: SettingsSectionSlug;
  labelKeys: string[];
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchSection[] = [
  {
    section: "freewind",
    labelKeys: [
      "freewind.disableUncommonFeatures.label",
      "freewind.playTurnCompleteSound.label",
      "freewind.turnCompleteSound.label",
      "settings.general.ttsEnabled.label",
      "settings.general.ttsEngine.label",
      "settings.general.ttsRate.label",
      "settings.general.ttsPreview.label",
    ],
  },
  {
    section: "general",
    labelKeys: [
      "settings.general.language.label",
      "settings.general.sendShortcut.label",
      "settings.general.defaultSend.label",
    ],
  },
  {
    section: "appearance",
    labelKeys: [
      "settings.appearance.theme.title",
      "settings.appearance.fonts.interfaceFont",
      "settings.appearance.fonts.interfaceSize",
      "settings.appearance.fonts.contentSize",
      "settings.appearance.fonts.codeFont",
      "settings.appearance.fonts.codeSize",
      "settings.appearance.syntax.highlightTheme",
      "settings.appearance.layout.contentWidth",
    ],
  },
  {
    section: "sidebar",
    labelKeys: [
      "settings.appearance.sidebar.header.title",
      "settings.appearance.sidebar.footer.title",
      "settings.layout.openInSidePane.title",
      "settings.layout.openInSidePane.sources.serviceUrls.label",
    ],
  },
  {
    section: "chat",
    labelKeys: [
      "settings.general.autoExpandReasoning.label",
      "settings.general.chatDisplay.label",
      "settings.appearance.chatOutline.title",
      "settings.appearance.detailLevel.title",
    ],
  },
  {
    section: "terminal",
    labelKeys: ["settings.general.terminalScrollback.label"],
  },
  {
    section: "browser",
    labelKeys: ["settings.general.browserData.title", "settings.general.browserData.siteData"],
  },
  {
    section: "editor",
    labelKeys: ["settings.editor.vimKeybindings"],
  },
  {
    section: "files",
    labelKeys: ["settings.files.title"],
  },
  { section: "shortcuts", labelKeys: [] },
  {
    section: "integrations",
    labelKeys: ["settings.integrations.commandLine.title"],
  },
  {
    section: "notifications",
    labelKeys: [
      "settings.notifications.permission",
      "settings.notifications.playSound",
      "settings.notifications.test",
    ],
  },
  {
    section: "permissions",
    labelKeys: ["settings.permissions.microphone"],
  },
  {
    section: "diagnostics",
    labelKeys: ["settings.diagnostics.app.rowTitle", "settings.diagnostics.testAudio"],
  },
  {
    section: "about",
    labelKeys: ["settings.about.releaseChannel.label", "settings.about.updates.label"],
  },
];

/**
 * 关键词命中：多词按空白拆分，每个词都要以相邻子串出现。关掉子序列匹配，是为了让
 * 「标出来的」与「筛出来的」永远一致——高亮用的是同一个调用。
 */
export function settingsTextMatches(query: string, text: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return scoreTextFields(trimmed, [text], { subsequence: false }) !== null;
}

/** 与 settingsTextMatches 同一规则命中的位置，供 SettingsRow 标注。 */
export function settingsHighlightRanges(query: string, text: string): MatchRange[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return findHighlightRanges(trimmed, text, { subsequence: false });
}

/** 有任意一行文案命中的分区。空搜索词表示「没在搜」，返回空集合。 */
export function settingsSectionsMatching(
  query: string,
  language: string,
): Set<SettingsSectionSlug> {
  const hits = new Set<SettingsSectionSlug>();
  const trimmed = query.trim();
  if (!trimmed) return hits;
  // 语言显式传进来而不是从当前 i18n 实例读：调用方的 memo 才会把它算作真依赖，
  // 切语言后命中列表才会重算。
  const translate = i18n.getFixedT(language);
  for (const section of SETTINGS_SEARCH_INDEX) {
    for (const labelKey of section.labelKeys) {
      if (settingsTextMatches(trimmed, translate(labelKey))) {
        hits.add(section.section);
        break;
      }
    }
  }
  return hits;
}
