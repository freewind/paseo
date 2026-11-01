/**
 * 选中的文字，读不到时返回 `null`。
 *
 * 默认实现，也是 TypeScript 解析 `@/assistant-comment/selection` 得到的实现：永远返回
 * `null`。Metro 在构建时按平台选文件，真实构建不会跑到它：web 走 `selection.web.ts`，
 * 原生走 `selection.native.ts`。
 */
export function readAssistantCommentSelection(): string | null {
  return null;
}
