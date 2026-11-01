import type {
  BulkCloseConfirmationLabels,
  BulkClosableTabGroups,
} from "@/screens/workspace/workspace-bulk-close";
import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
} from "@/screens/workspace/workspace-bulk-close";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

/**
 * 批量关闭确认弹窗的正文：先按 tab 类型分组，再补一段「其中几个有未保存内容」。
 *
 * 「哪些 tab 有未保存内容」只能由调用方回答 —— tab 栏读文件面板发布的属性；侧栏列表里只有
 * agent tab，没有这类面板，所以传空集。把它做成入参，两处才不会各自拼一份消息。
 */
export function buildBulkClosePlan(input: {
  tabsToClose: WorkspaceTabDescriptor[];
  resolveKind: (agentId: string) => "archive" | "layout-only";
  modifiedTabIds: ReadonlySet<string>;
  labels: BulkCloseConfirmationLabels;
  unsavedMessage: (count: number) => string;
}): { groups: BulkClosableTabGroups; message: string } {
  const { tabsToClose, resolveKind, modifiedTabIds, labels, unsavedMessage } = input;
  const groups = classifyBulkClosableTabs(tabsToClose, resolveKind);
  const message = buildBulkCloseConfirmationMessage(groups, labels);
  const modifiedCount = tabsToClose.filter((tab) => modifiedTabIds.has(tab.tabId)).length;
  return {
    groups,
    message: modifiedCount > 0 ? `${message}\n\n${unsavedMessage(modifiedCount)}` : message,
  };
}
