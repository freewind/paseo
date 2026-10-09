import type { ASTNode } from "react-native-markdown-display";

const HEADING_TYPE = /^heading[1-6]$/;

/** Keeps the heading level visible in the quote, since the source text drops the hashes. */
export function markdownHeadingPrefix(node: ASTNode): string {
  if (!HEADING_TYPE.test(node.type)) {
    return "";
  }
  const markup = typeof node.markup === "string" ? node.markup : "";
  return markup.length > 0 ? markup + " " : "";
}

function collectPlainText(node: ASTNode | null | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text" && typeof node.content === "string") {
    return node.content;
  }
  const children: ASTNode[] = Array.isArray(node.children) ? node.children : [];
  return children.map(collectPlainText).join("");
}

/**
 * The markdown source of one rendered block, for quoting it back to the agent. Block tokens
 * carry the unparsed source in `content`; the plain-text walk only covers tokens that don't.
 */
export function markdownBlockText(node: ASTNode): string {
  const direct = typeof node.content === "string" ? node.content.trim() : "";
  const content = direct.length > 0 ? direct : collectPlainText(node);
  return (markdownHeadingPrefix(node) + content).trim();
}
