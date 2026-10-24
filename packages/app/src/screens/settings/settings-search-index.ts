import { i18n } from "@/i18n/i18next";

/**
 * Static search index for the settings sidebar. One entry per settings row: the section it
 * lives in and the i18n keys of its visible text. Labels resolve through `t()` at search
 * time, so every language works and copy changes never stale the index. Plugin sections are
 * absent — their rows come from plugin manifests, and the sidebar filter still matches them
 * by section title.
 *
 * Keep this in sync with the section components; a row added without an index entry is
 * simply unsearchable, and typecheck cannot catch that.
 */
export interface SettingsSearchRow {
  labelKey: string;
  hintKey?: string;
}

export type SettingsSectionSlugForSearch =
  | "general"
  | "appearance"
  | "sidebar"
  | "chat"
  | "terminal"
  | "browser"
  | "editor"
  | "shortcuts"
  | "integrations"
  | "notifications"
  | "permissions";

export interface SettingsSearchSection {
  section: SettingsSectionSlugForSearch;
  rows: SettingsSearchRow[];
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchSection[] = [
  {
    section: "general",
    rows: [
      { labelKey: "settings.general.defaultSend.label" },
      { labelKey: "settings.general.terminalScrollback.label" },
      { labelKey: "settings.general.browserData.title" },
    ],
  },
  {
    section: "appearance",
    rows: [
      { labelKey: "settings.appearance.theme.title" },
      { labelKey: "settings.appearance.fonts.interfaceFont" },
      { labelKey: "settings.appearance.fonts.interfaceSize" },
      { labelKey: "settings.appearance.fonts.contentSize" },
      { labelKey: "settings.appearance.fonts.codeFont" },
      { labelKey: "settings.appearance.fonts.codeSize" },
      { labelKey: "settings.appearance.layout.contentWidth" },
    ],
  },
  {
    section: "sidebar",
    rows: [],
  },
  {
    section: "chat",
    rows: [
      { labelKey: "settings.general.autoExpandReasoning.label" },
      { labelKey: "settings.general.toolCallDetail.label" },
      { labelKey: "settings.general.playTurnCompleteSound.label" },
      { labelKey: "settings.general.turnCompleteSound.label" },
      { labelKey: "settings.general.ttsEnabled.label" },
      { labelKey: "settings.general.ttsEngine.label" },
      { labelKey: "settings.general.ttsRate.label" },
      { labelKey: "settings.general.ttsPreview.label" },
      { labelKey: "settings.appearance.chatOutline.title" },
      { labelKey: "settings.appearance.chatOutlineTextLabels.title" },
    ],
  },
  {
    section: "terminal",
    rows: [{ labelKey: "settings.general.terminalScrollback.label" }],
  },
  {
    section: "browser",
    rows: [{ labelKey: "settings.general.browserData.title" }],
  },
  {
    section: "editor",
    rows: [
      { labelKey: "settings.editor.preferredEditor" },
      { labelKey: "settings.editor.vimKeybindings", hintKey: "settings.editor.vimHint" },
    ],
  },
  {
    section: "shortcuts",
    rows: [],
  },
  {
    section: "integrations",
    rows: [{ labelKey: "settings.integrations.commandLine.title" }],
  },
  {
    section: "notifications",
    rows: [
      { labelKey: "settings.notifications.permission" },
      { labelKey: "settings.notifications.playSound" },
      { labelKey: "settings.notifications.test" },
    ],
  },
  {
    section: "permissions",
    rows: [{ labelKey: "settings.permissions.microphone" }],
  },
];

export interface SettingsSearchHit {
  section: string;
  /** The label/hint text that matched, for display in the results list. */
  matchedText: string;
}

function matches(query: string, text: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

/**
 * Which sections have a row whose label or hint contains the query. The empty-query case is
 * handled by the caller (it means "no search"). Matching is case-insensitive substring —
 * the plain, forgiving behavior settings lookup wants.
 */
export function searchSettingsSections(
  query: string,
  isSectionAvailable: (section: string) => boolean,
): SettingsSearchHit[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const hits: SettingsSearchHit[] = [];
  for (const section of SETTINGS_SEARCH_INDEX) {
    if (!isSectionAvailable(section.section)) continue;
    for (const row of section.rows) {
      const label = i18n.t(row.labelKey);
      if (matches(trimmed, label)) {
        hits.push({ section: section.section, matchedText: label });
        continue;
      }
      if (row.hintKey) {
        const hint = i18n.t(row.hintKey);
        if (matches(trimmed, hint)) {
          hits.push({ section: section.section, matchedText: hint });
        }
      }
    }
  }
  return hits;
}

/** Sections whose title matches the query even when no indexed row does. */
export function searchSettingsSectionTitles(
  query: string,
  sectionTitleOf: (section: string) => string | undefined,
  isSectionAvailable: (section: string) => boolean,
): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const result: string[] = [];
  for (const section of SETTINGS_SEARCH_INDEX) {
    if (!isSectionAvailable(section.section)) continue;
    const title = sectionTitleOf(section.section);
    if (title && matches(trimmed, title) && !result.includes(section.section)) {
      result.push(section.section);
    }
  }
  return result;
}
