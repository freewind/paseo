const DIFF_LANGUAGES = new Set(["patch", "diff"]);

export function getMarkdownFenceLanguage(info: string | null | undefined): string | null {
  return info?.trim().split(/\s+/)[0]?.toLowerCase() || null;
}

/** Whether a normalized fence language should render as a unified diff. */
export function isDiffFenceLanguage(language: string | null): boolean {
  return language !== null && DIFF_LANGUAGES.has(language);
}
