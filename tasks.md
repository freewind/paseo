# 任务记录

最近一次保存：2026-10-22 16:05

---

### 移常用回复标题行至滚动流末尾

- 状态：已完成
- 最近保存：2026-10-21 14:16

quick-replies-bar.tsx：header（标题+管理按钮）从 chips 上方移到 chips 之后，随 ScrollView 内容滚动；sheet（showTitle=false）不受影响。

Notes：

- 2026-10-21 14:16：已提交，标题与管理按钮改放到滚动流末尾。

---

### 加大权限请求按钮左右间距

- 状态：已完成
- 最近保存：2026-10-21 14:16

agent-stream/view.tsx PermissionRequestCard：optionsContainer 的 gap 与按钮水平内边距加大，使拒绝/执行/继续等按钮视觉上相互独立。

Notes：

- 2026-10-21 14:16：gap 由 spacing[2] 改为 spacing[3]，按钮水平内边距由 spacing[3] 改为 spacing[4]。

---

### 常用回复管理按钮改普通图标按钮

- 状态：已完成
- 最近保存：2026-10-21 14:16

quick-replies-bar.tsx：editChip 去掉药丸形 border/背景/圆角，改为普通/plain 图标按钮样式，保留 hover/pressed 反馈。

Notes：

- 2026-10-21 14:16：去掉圆角、边框与背景，hover/pressed 改用透明度。

---

### 回退菜单回退对话置于重新回答前

- 状态：已完成
- 最近保存：2026-10-21 14:16

rewind-menu.tsx：conversation 项排在 regenerate 项之前，其余项（files/both）顺序不变。

Notes：

- 2026-10-21 14:16：回退项整体上移到重新回答之前。

---

### Edit 调用标题右侧显示 path

- 状态：已完成
- 最近保存：2026-10-21 14:16

定位 Pi 自定义 Edit 的注册与入参 schema；使 mapper/display 提取 path 作为 summary（与 Read/Write 一致），保留完整参数供 debug。

Notes：

- 2026-10-21 14:16：Pi 的 edit 工具入参是 path 加 operations，daemon 映射不到 edit 详情，显示走 unknown。改在 protocol 显示层：未映射工具从原始入参提取 path 作为摘要，完整入参照旧展示。

---

### 删除 tool-discovery 显示定制代码

- 状态：已完成
- 最近保存：2026-10-21 14:16

tool-call-display.ts 删 TOOL_DISCOVERY_MCP_PREFIX、buildToolDiscoveryDisplay、readToolDiscoverySummary 及 buildToolCallDisplayModel 中引用；tool-call-display.test.ts 删 6 个相关用例。

Notes：

- 2026-10-21 14:16：定制代码与 6 个测试用例全部删除，测试 13 项通过。

---

### 排查左侧时间线 hover 弹层失效

- 状态：已完成
- 最近保存：2026-10-21 14:16

只读调查：左侧时间轴 hover 弹出内容浮层在改右侧 user message 时间线后疑似被破坏，定位根因；修复方案另行讨论确认。

Notes：

- 2026-10-21 14:16：根因是 149b360f6 把圆点预览与文字形态绑定（showPreview={variant !== "text"}）。已恢复圆点始终显示悬停预览，文字形态仍点击打开全文浮层。浏览器测试因 prompt-detail.web.tsx 的 require 报错无法运行，未验证。

---

### Cmd+Shift+T 重新打开已关闭 tab

- 状态：待办
- 最近保存：2026-10-21 14:16

桌面端关闭 agent tab 后（Cmd+W），支持 Cmd+Shift+T 恢复最近关闭的 tab，类似浏览器。需研究 workspace-layout-store 的 closeTab 流程与快捷键注册位置（use-keyboard-shortcuts）。

---

### 前进后退历史支持已关闭的 agent tab

- 状态：待办
- 最近保存：2026-10-21 14:16

navigation-history-store 回放时，目标 agent tab 已关闭则回退/前进失效。需让回放能重新打开已关闭的 agent chat tab（rebindReplayInstance / NavigationHistoryBridge 一带）。

---

### 返回/前进历史只记 agent chat

- 状态：已完成
- 最近保存：2026-10-21 23:36

侧栏「返回 / 前进」的历史只允许包含主 agent chat（target.kind === "agent"），忽略其它类型页面：provider_subagent、draft、new_tab、terminal、browser、files、changes_tree、working_diff、commit_diff、pull_request、plugin、setup，以及所有非 workspace 页面路由（/settings 等）。过滤放在 navigation-history-store 的 recordNavigation 入口，与最近访问共用同一条判定。

---

### 统一 tab 菜单与列表菜单的彻底删除会话项

- 状态：已完成
- 最近保存：2026-10-22 16:05

左侧列表下拉菜单有「彻底删除会话」，tab 右键菜单没有。两边共用 buildWorkspaceTabMenuEntries，但该项依赖可选参数 onDeleteAgent，tab 的桌面行与移动端两处调用方都没传。

工作项：

- 新增 useDeleteAgentWithConfirm({ serverId }) 封装确认弹窗与删除
- use-workspace-agent-tab-actions 改为复用该 hook
- workspace-desktop-tabs-row 上层取 onDeleteAgent 并透传
- workspace-screen 移动端 tab 菜单接入
- 补测试断言并跑 typecheck/lint/unit

Notes：

- 2026-10-22 16:00：开始实施，范围仅「彻底删除会话」一项，「移动到工作区」的差异不纳入。
- 2026-10-22 16:05：已提交 a6f142897 并 push。新增 useDeleteAgentWithConfirm，桌面 tab 行与移动端 tab 选项各取一次后透传，列表同步改用同一 hook；测试 10 项通过，lint/typecheck 均通过。浏览器实际点击未验证。
