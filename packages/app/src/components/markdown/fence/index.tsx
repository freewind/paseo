import type { ComponentType } from "react";
import { DiffViewer } from "@/components/diff-viewer";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import { parseUnifiedDiff } from "@/utils/tool-call-parsers";
import { getMarkdownFenceLanguage, isDiffFenceLanguage } from "./language";
import { MermaidFence } from "./mermaid";
import type { MarkdownFenceRendererProps } from "./types";

export interface MarkdownFenceBlockProps extends MarkdownFenceRendererProps {
  info: string | null | undefined;
}

const diagramFences: Partial<Record<string, ComponentType<MarkdownFenceRendererProps>>> = {
  mermaid: MermaidFence,
};

/** Diff blocks in chat can be long; cap the DiffViewer height so a huge patch
 * scrolls inside the message instead of blowing it out vertically. */
const CHAT_DIFF_MAX_HEIGHT = 480;

export function MarkdownFenceBlock({
  code,
  info,
  phase,
  inheritedStyles,
  textStyle,
}: MarkdownFenceBlockProps) {
  const language = getMarkdownFenceLanguage(info);
  if (isDiffFenceLanguage(language)) {
    return <DiffViewer diffLines={parseUnifiedDiff(code)} maxHeight={CHAT_DIFF_MAX_HEIGHT} />;
  }
  const DiagramFence = language ? diagramFences[language] : undefined;
  if (DiagramFence) {
    return (
      <DiagramFence
        code={code}
        phase={phase}
        inheritedStyles={inheritedStyles}
        textStyle={textStyle}
      />
    );
  }
  return (
    <HighlightedCodeBlock
      code={code}
      language={language}
      inheritedStyles={inheritedStyles}
      textStyle={textStyle}
    />
  );
}
