import type { ReactNode } from "react";

/**
 * 两侧工作区菜单的总顺序表：侧栏与 Chat 页头部都按这一份清单渲染，顺序因此永远一致。
 *
 * 某一侧没有对应入口时，给 `null` 占位（侧栏就没有「导入会话」与「显示设置」），
 * 而不是从清单里去掉——去掉会让两侧顺序重新错开。
 *
 * 侧栏这两个 `null` 不是「先不做」，是做不到：这两项的动作都由 workspace-screen 内部的状态
 * 与回调驱动，而侧栏菜单的三个调用点拿不到它们。不写明这一点，后来的人会以为补个回调
 * 就能填上，去改调用点后才发现改不动。
 *
 * 各条目的 JSX 仍由两侧各自实现：渲染组件是 WorkspaceMenuItem 与 DropdownMenuItem，
 * testID 一个带 workspaceKey 后缀、一个是固定字符串，图标与可用性语义也不同。
 * 清单只负责「有哪些项、什么顺序」，少写一项就编译不过。
 */
export const WORKSPACE_MENU_ITEM_KEYS = [
  "copyPath",
  "copyBranchName",
  "rename",
  "importSession",
  "separator",
  "markAsRead",
  "markAsUnread",
  "pin",
  "labels",
  "showSetup",
  "openFolder",
  "archive",
] as const;

export type WorkspaceMenuItemNodes = Record<(typeof WORKSPACE_MENU_ITEM_KEYS)[number], ReactNode>;

/** 按清单顺序取出两侧各自实现的节点，两侧都不再自己排顺序。 */
export function orderWorkspaceMenuItems(nodes: WorkspaceMenuItemNodes): ReactNode[] {
  return WORKSPACE_MENU_ITEM_KEYS.map((key) => nodes[key]);
}
