const LABEL_CHARACTER_LIMIT = 5;

/**
 * Chip label: the first five characters plus an ellipsis. Display only — selecting a chip
 * always sends the reply's full text.
 */
export function truncateQuickReplyLabel(text: string): string {
  const characters = Array.from(text.trim());
  if (characters.length <= LABEL_CHARACTER_LIMIT) {
    return characters.join("");
  }
  return `${characters.slice(0, LABEL_CHARACTER_LIMIT).join("")}…`;
}
