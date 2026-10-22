# 任务记录

最近一次保存：2026-10-22 17:20

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
- 2026-10-22 16:11：「移动到工作区」在 tab 菜单缺失的根因找到：tab 行有三条渲染路径，explorer 侧栏那条没透传 onMoveAgentToWorkspace，其余两条都传了。已补透传并加 builder 测试锁定位置与回调，11 项测试通过。曾试把该 prop 改为必填防复发，会连锁到 split-container 的可选 prop，已回退。

---

### 修移动到工作区弹窗的工作区列表

- 状态：已完成
- 最近保存：2026-10-22 16:27

移动到工作区弹窗里，选完项目后工作区列表是空的，只剩搜索与新建。

Notes：

- 2026-10-22 16:27：根因是 use-agent-transfer-workspace 拿 workspaceKeys 里的 `serverId:workspaceId` 拼接串当 session.workspaces 的 Map key 查，永远查不到。改为先用 parseWorkspaceStructureKey 解出身份，再按 key 里的 serverId 取 session，用 resolveWorkspaceMapKeyByIdentity 拿到真正的 Map key。同时当前工作区不再剔除，改为 isCurrent 标记，弹窗里渲染成 disabled 并在名称后追加「当前」文案。i18n 九个语言文件均补 currentWorkspace。测试 7 项通过，lint 与 typecheck 通过。界面未验证。

---

### 修复 NavigationHistoryBridge 在首屏报无限更新

- 状态：已完成
- 最近保存：2026-10-22 16:34

新打开或刷新页面时经常抛 `Maximum update depth exceeded`，报错组件指向 NavigationHistoryBridge。

Notes：

- 2026-10-22 16:34：根因是 selector 不纯。workspace 尚无持久化 layout 时，下一层 `getWorkspaceLayout` 每次调用都会新建默认 layout，而默认 layout 的空白 tab 用随机 id（new-tab.ts 里 generateMessageId）。bridge 的 selector 把它算成 `activeTabKey`，每次结果都不同；zustand v5 把 selector 放进 useSyncExternalStore 的 getSnapshot，React 反复校验快照后不断重渲染直到抛出上限。修复：readActiveTab 在 layoutByWorkspace 缺失时直接返回 null；sidebar 的 useCurrentAgentId 同型位点一并加 guard。两个测试文件补上占位 layout，并新增 readActiveTab 在缺 layout 时稳定的用例。bridge 测试 13 项、sidebar 测试 7 项通过，lint 与 typecheck 通过。界面未复验。

---

### 修复切回会话后备忘录列表变空

- 状态：已完成
- 最近保存：2026-10-22 16:39

写完备忘录后切到 settings 再回来，列表是空的；再加一条备忘录，旧的又全部出现。

Notes：

- 2026-10-22 16:39：数据一直都在，是本地缓存被误清。当前 daemon 是 Paseo.app 内置版本，不含今天新增的「打开会话时回填备忘录」，fetch_agent_response 因此不带 memos；而 daemon-client 把它兜底成 `payload.memos ?? []`，agent-panel 又无条件 setAgentMemos，空数组在 store 里走 delete 分支，缓存被清。add 的响应一直带全量列表，所以再加一条又把旧的全写回来。修复：FetchAgentResult.memos 改可选、去掉 ?? [] 兜底；agent-panel 只在字段存在时写回。client 新增两条用例锁定「缺字段为 undefined」与「显式空数组仍为 []」。测试 2 项通过，session-store 备忘录测试 3 项通过，lint 与 typecheck 通过。界面未复验。

---

### 修侧栏 workspace 行的空白文本节点警告

- 状态：已完成
- 最近保存：2026-10-22 16:44

网页控制台报 `Unexpected text node:  . A text node cannot be a child of a <View>`。

Notes：

- 2026-10-22 16:44：警告里的文本节点是一个空格（RNW 在 nodeValue 后自己接句点）。sidebar-workspace-list 给 SidebarWorkspaceRowContent 的第一个子节点写了 `{" "}`，而该组件把 children 直接放进 View（rowRight），空白文本节点就成了 View 的直接子节点。删掉该分隔空格。另两处 `{" "}`（command-center 文件名副标题、pull request 标题编号）都在 Text 内部，安全保留。侧栏测试 19 文件 147 项通过，lint 通过。

---

### 修 tool call 卡片的按钮嵌套警告

- 状态：已完成
- 最近保存：2026-10-22 17:01

控制台报 `In HTML, <button> cannot be a descendant of <button>`，组件栈指向 ToolCallSlot。

Notes：

- 2026-10-22 17:01：RNW 0.21 的 propsToAccessibilityComponent 把 role=button 的 View / Pressable 渲染成真 <button>，不再是 div[role=button]。ExpandableBadge 外层 Pressable 包住整行，行内的 CopyTextButton 与 tool-call-open-file 也是 role=button，形成嵌套。改为 headerRow 做外层容器，Pressable 只包图标与标签；open-file 抽成 ExpandableBadgeOpenFileButton，与 trailingAction 一起作为兄弟节点。可见变化：hover 时出现的打开文件图标改为行尾对齐。用户运行时查到 3 条 button button，本次修掉两条（copy / open-file），剩余条数待刷新后重测。
- 另记：`src/agent-stream/chat-outline` 两个测试文件在当前 main 上加载即报 `SyntaxError: Unexpected identifier 'ReactElement'`，已用 stash 验证与本次改动无关，未修。

---

### 备忘录支持编辑

- 状态：已完成
- 最近保存：2026-10-22 17:20

列表里只能追加、勾选完成、删除；update 链路（协议、daemon、client、useAgentMemos）早就存在，缺 UI 入口。

Notes：

- 行右键菜单加「编辑」，该行换成备忘录输入框，预填文本与已存图片。
- 已存图是跟备忘录存的 inline base64，不在附件库里（encodeAttachmentsForSend 读不到），所以按 data URL 直接预览、原 base64 原样回传；新增图片仍走附件流程。
- 提交走 updateMemo：图片集合没变就省略 images 参数（daemon 保留原图），变了传完整数组，空数组就是把图清空。比的是 each image 的 data，长度相同但换了图也能识别。
- 编辑态同样 autoFocus，目的是点了编辑就能直接改。
