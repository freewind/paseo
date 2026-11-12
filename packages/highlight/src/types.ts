export type HighlightStyle =
  | "keyword"
  | "comment"
  | "string"
  | "number"
  | "literal"
  | "function"
  | "definition"
  | "class"
  | "type"
  | "tag"
  | "attribute"
  | "property"
  | "variable"
  | "operator"
  | "punctuation"
  | "regexp"
  | "escape"
  | "meta"
  | "heading"
  | "link";

export interface HighlightToken {
  text: string;
  style: HighlightStyle | null;
  // 必须保持可选：旧版本的 diff 数据不带这个字段，读出来是 undefined，等同不做
  // 行内标记；设成必填会让旧数据在解析阶段直接失败。
  changed?: boolean;
}
