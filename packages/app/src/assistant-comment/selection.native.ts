import { requireOptionalNativeModule } from "expo-modules-core";
import { createSelectionReader } from "@/assistant-comment/selection-model";

interface PaseoTextSelectionModule {
  /** 同步读取；主线程阻塞超过模块内超时值时返回 null。 */
  getSelectedText(): string | null;
}

const textSelectionModule =
  requireOptionalNativeModule<PaseoTextSelectionModule>("PaseoTextSelection") ?? null;

/**
 * 原生选中的文字，或 `null`。
 *
 * React Native 的 `Text` 不暴露选择区间，Markdown 在原生侧是文本视图，区间只存在原生视图里，
 * 所以由 `PaseoTextSelection` 读取。模块内部在主线程上取一次并按 500ms 超时兜底：主线程卡住
 * 时返回 null，JS 调用不会挂死。
 */
export const readAssistantCommentSelection = createSelectionReader(
  () => textSelectionModule?.getSelectedText() ?? null,
);
