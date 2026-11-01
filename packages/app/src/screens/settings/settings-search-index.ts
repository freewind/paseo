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
 *
 * 索引只收行标题：行内描述（`SettingsRow` 的 `hint`）不参与搜索，记得描述里的词、记不住
 * 标题文本时那一行搜不到。这是有意的范围决定，不是还没接上的遗漏。
 */
// 上游同步过来的 settings 改动同样要维护这份清单：删掉的行会把旧 key 留在这里。
export const SETTINGS_SEARCH_INDEX: {
  section: SettingsSectionSlug;
  labelKeys: string[];
}[] = [
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

const indexedLabelsBySectionAndLanguage = new Map<string, ReadonlySet<string>>();
const allIndexedLabelsByLanguage = new Map<string, ReadonlySet<string>>();

/**
 * 某分区在索引里登记的行文案，按当前语言解析。缓存按「语言 + 分区」分开，切语言后自然重建。
 */
function settingsIndexedLabels(section: SettingsSectionSlug): ReadonlySet<string> {
  const language = i18n.language;
  const cacheKey = `${language}\u0000${section}`;
  const cached = indexedLabelsBySectionAndLanguage.get(cacheKey);
  if (cached) return cached;
  const translate = i18n.getFixedT(language);
  const labels = new Set(
    (SETTINGS_SEARCH_INDEX.find((entry) => entry.section === section)?.labelKeys ?? []).map((key) =>
      translate(key),
    ),
  );
  indexedLabelsBySectionAndLanguage.set(cacheKey, labels);
  return labels;
}

/**
 * 所有分区登记过的行文案的并集。一行可能渲染在多个分区下（侧边栏服务地址行同时出现在
 * general 与 sidebar），只要任一分区登记过就不会搜不到，不算漏登记。
 */
export function settingsAllIndexedLabels(): ReadonlySet<string> {
  const language = i18n.language;
  const cached = allIndexedLabelsByLanguage.get(language);
  if (cached) return cached;
  const labels = new Set<string>();
  for (const entry of SETTINGS_SEARCH_INDEX) {
    for (const label of settingsIndexedLabels(entry.section)) labels.add(label);
  }
  allIndexedLabelsByLanguage.set(language, labels);
  return labels;
}

/**
 * 关键词命中：多词按空白拆分，每个词都要以相邻子串出现，任一字段命中即算。关掉子序列
 * 匹配，是为了让「标出来的」与「筛出来的」永远一致——高亮用的是同一个调用。
 */
export function settingsTextMatches(query: string, texts: readonly string[]): boolean {
  const trimmed = query.trim();
  if (!trimmed) return false;
  return scoreTextFields(trimmed, [...texts], { subsequence: false }) !== null;
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
  // 切语言后命中列表才会重算。行文案同时按当前语言和英文解析：中文界面下搜英文名
  // （tts、vim）也该命中，只解析当前语言会让这类查询落空。
  const translate = i18n.getFixedT(language);
  const translateEnglish = language === "en" ? null : i18n.getFixedT("en");
  for (const section of SETTINGS_SEARCH_INDEX) {
    for (const labelKey of section.labelKeys) {
      const texts = translateEnglish
        ? [translate(labelKey), translateEnglish(labelKey)]
        : [translate(labelKey)];
      if (settingsTextMatches(trimmed, texts)) {
        hits.add(section.section);
        break;
      }
    }
  }
  return hits;
}
