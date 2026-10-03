/**
 * Strips common Markdown syntax to leave readable plain text, for reading agent replies aloud
 * with TTS. Not a full renderer — it removes the markers that would otherwise be spoken
 * verbatim (headers, emphasis, code fences, links, list bullets) and keeps the content.
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return "";

  let text = markdown;

  // Fenced code blocks: keep their contents, drop the fence markers and language tag.
  text = text.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => code.trimEnd());
  text = text.replace(/~~~[^\n]*\n([\s\S]*?)~~~/g, (_, code: string) => code.trimEnd());

  // Inline code backticks.
  text = text.replace(/`([^`]+)`/g, "$1");

  // Images: ![alt](src) — keep nothing (the alt text is usually not spoken).
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");

  // Links: [text](url) -> text.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Headers: remove leading hashes.
  text = text.replace(/^\s{0,3}#{1,6}\s*/gm, "");

  // Blockquotes.
  text = text.replace(/^\s{0,3}>\s?/gm, "");

  // Emphasis / bold markers.
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/\*\*|__|\*|_/g, "");

  // Strikethrough.
  text = text.replace(/~~(.*?)~~/g, "$1");

  // List markers: "- ", "* ", "+ ", and ordered "1. ".
  text = text.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/gm, "");

  // Horizontal rules.
  text = text.replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");

  // Collapse leftover multiple blank lines.
  text = text.replace(/\n{3,}/g, "\n\n");
  // Collapse runs of spaces left by removed images/inline markup.
  text = text.replace(/ {2,}/g, " ");

  return text.trim();
}
