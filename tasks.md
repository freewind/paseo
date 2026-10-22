# 任务记录

最近一次保存：2026-10-23 07:35

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

---

### 备忘录删除与压缩上下文改为原位确认

- 状态：已完成
- 最近保存：2026-10-22 17:40

网页上这两处弹的是浏览器原生 window.confirm，因为 confirmDialog 的三端实现都是系统对话框（native Alert、desktop dialog.ask、web window.confirm）。

Notes：

- 全仓 confirmDialog 调用点 34 处 / 25 文件，本次只动这两处，其余保留系统对话框。
- 新增 `components/ui/inline-confirm.tsx`：触发点点击后原地变取消/确认；web 上点外部或 Esc 复原；支持受控 open（context window 圆环就是受控切换到确认态）。
- useCompactContext 不再弹确认，只暴露 canCompact 与 sendCompact。
- docs/design.md 两种确认的分工已写入：会丢工作用 confirmDialog，触发点已说明后果的小操作用 InlineConfirm。

---

### hover 文本大纲时不再点亮左侧圆点

- 状态：已完成
- 最近保存：2026-10-22 18:05

左侧 dots 与右侧文本大纲共用同一个 hoveredIndex，hover 文本行会走同一个 hoverIntent.pointAt，左侧对应圆点放大并弹出 preview 卡片。

Notes：

- 文本大纲的 hover 与 focus 都不再写 hoveredIndex / focusedIndex；左侧 attention 只由圆点自己驱动。
- ChatOutlineTextRail / ChatOutlineTextRow 去掉 onHover、onLeave、onFocusChange。
- 既有阻塞：`src/agent-stream/chat-outline/rail.web.test.tsx` 与 `sheet.test.tsx` 在当前 main 上加载即报 `SyntaxError: Unexpected identifier 'ReactElement'`（已用 stash 验证与本次无关）。这两文件无法运行，本次只用 lint / typecheck 与浏览器测试断言修改自证。

---

### 右侧文本大纲跟随聊天滚动

- 状态：已完成
- 最近保存：2026-10-22 18:30

聊天区滚动会更新 activeSeq，但右侧列表只换文字颜色，列表本身不动。

Notes：

- 行用 onLayout 上报 y 与高度，ScrollView 上报可视高度；activeSeq 变化时把对应行滚到垂直居中。
- 按测量出的行框算，不用 index × 行高：行最多两行，中间还有带序号的分隔线。
- 程序滚动开 500ms 窗口，窗口外的 onScroll / onScrollBeginDrag 视为用户手动滚动，暂停跟随；从 popover 跳转后恢复。
- 左侧 dots 不动：它按屏幕高度比例排布，不滚动。

---

### 项目与主机筛选支持搜索

- 状态：已完成
- 最近保存：2026-10-22 18:50

两个筛选下拉都是 Combobox（searchable 默认 true），但 ProjectFilter、HostFilter 显式传了 false；HostPicker 还有 10 个主机的阈值。

Notes：

- ProjectFilter / HostFilter 删掉 searchable={false}。
- HostPicker 的 searchable 默认改 true，删掉 SEARCHABLE_THRESHOLD；settings 的 Switch host 仍显式关闭。
- 删掉硬编码的 "Search hosts" 占位符，改用 Combobox 默认的 common.placeholders.search。
- title 未改（用户说不需要加 title）。
- host-picker.test.tsx 6 passed。

---

### 备忘录缩略图加反色边框

- 状态：已完成
- 最近保存：2026-10-22 19:15

行内 24×24 与编辑态 32×32 的缩略图都没边框，图片内容与背景相近时边界看不出来。

Notes：

- 边框色用 `theme.colors.foreground`：它本来就是背景的反色（深色主题近白、浅色主题近黑），需要它的时候一定和图片本身不同色，不新增 token。
- 彩色边框方案被否决：项目里没有 `borderColor: palette.*` 的先例，且彩色可能在某个主题里与图撞色。
- 两处样式：agent-memos-rail 的 memoImage、agent-memo-composer 的 thumbnail（后者覆盖已存图、新加图、粘贴占位）。

---

### History 列表增加模型列

- 状态：已完成
- 最近保存：2026-10-22 19:45

数据本来就有（AgentSnapshotPayload.model 必填），缺在 app 侧收窄成列表行时丢了 model。

Notes：

- AgentDirectoryEntry 的 Pick 加 model，三处构造 entry 的映射同步补字段（session-store、use-agent-history、use-aggregated-agents）。
- 桌面行在 project 与 host 之间加列（初版放在 branch 之后，用户看后要求前移），固定宽 160，单行截断；hover 用 Tooltip 显示完整 id。
- 单元格嵌在行的 Pressable 内，沿用行自己的 onPress/onLongPress，避免内层吞点击。
- 空 model 不渲染该格；无表头，所以不需要 i18n。
- sessions-screen.test.ts 与 use-agent-history.test.ts 共 23 passed。

---

### History 增加按模型筛选

- 状态：已完成
- 最近保存：2026-10-22 20:20

host 筛选保留（用户一度想改成只查当前 host，后来确认同一 daemon 的多条 URL 属于同一个 host，于是不改）。

Notes：

- 新增 components/hosts/model-filter.tsx，与 ProjectFilter 同构的 pill + Combobox，pill 上 model 截到 180。
- 选项来自已加载历史行的 model 去重，过滤是本地 filter；history RPC 的 filter 只支持 projectKeys，不动协议。
- 边界：选项与过滤只覆盖已加载页；未加载页里的 model 不出现在选项里。
- 选中的 model 消失时自动回到 All models；空结果时提供一次性清掉搜索与模型筛选的按钮。
- 少于两个具体 model 时不显示该筛选。

---

### History 行增加操作列

- 状态：已完成
- 最近保存：2026-10-22 20:50

列末加操作列，hover 显形，列宽固定不抽动。

Notes：

- 归档：未归档用 archiveAgent；已归档用 `client.refreshAgent(agentId)`——daemon 没有独立 unarchive RPC，agent 面板的 Unarchive 也是这么恢复的。
- 彻底删除：InlineConfirm 就地确认 → deleteAgent，失败 toast。
- 文案复用现有 key（agentList.archiveSheet.archive / agentPanel.archived.unarchive / agentList.deleteSheet.delete）。
- 未归档判断用 `archivedAt != null`；未处理 host 不支持 agentRestoreState 时隐藏 unarchive 按钮（目前一律显示）。

---

### 导航历史在网页刷新后保留

- 状态：已完成
- 最近保存：2026-10-22 21:15

侧栏返回/前进只读内存里的 navigation-history-store。历史页/文件/终端不算位置，刷新后落在历史页时一条位置也没有，按钮必然置灰——不是回归。

Notes：

- store 增加 `storage` 注入（getItem/setItem）；web 传 sessionStorage，native 与未注入时仍是内存。
- 每次 emit 写 entries/cursor/recentAgentVisits；replay 不持久化（跳转中途状态）。
- 读回时校验形状，读不懂的 payload 丢弃；cursor clamp 到 entries 范围。
- 选 sessionStorage 而不是 localStorage：标签页级，刷新保留、新标签页不共享。
- 另一个症状：历史页的“无法加载历史”是 host banner（sessions.hostLoadFailed），同一 host 的一条连接调用 fetchAgentHistory 失败，与返回按钮无关。

---

### 备忘录按最近动作排序

- 状态：已完成
- 最近保存：2026-10-22 21:40

之前：服务端按创建顺序追加，客户端 orderMemos 把已完成挪到后面，未完成组内保持旧→新，所以新建落在底部。

Notes：

- 协议 AgentMemoSchema 加可选 `updatedAt`；add/update/setCompleted 都写。
- 客户端按 `updatedAt ?? createdAt` 降序，去掉完成分组。可见变化：完成不再沉底，勾选那刻升顶。
- 旧记录没有 updatedAt，自然回退到创建时间倒序。
- 改 protocol 后必须 `npm run build:client` 重建声明，否则 server/app 类型报 updatedAt 不存在。
- `npm run test --workspace=@getpaseo/server` 会跑整套 unit（违反仓库规则）且出现无关失败；单文件用 `cd packages/server && npx vitest run <file>`。

---

### 修复备忘录文本 tooltip 不显示

- 状态：已完成
- 最近保存：2026-10-22 22:05

根本原因：`TooltipTrigger asChild` 包的是 `ContextMenuTrigger`，而它渲染 `<PressHighlight {...props} ref={handleRef}>`，后写的 ref 覆盖了 asChild 注入的 ref。Tooltip 的 `triggerRef.current` 恒为 null，`TooltipContent` 第一行就 return，所以既无 tooltip 也无报错。

Notes：

- 修法：TooltipTrigger 包一层普通 View（负责 hover 与测量），ContextMenuTrigger 放里面。
- 文本按钮抽成 AgentMemoTextButton，兼带绕过 jsx-max-depth 上限。
- 全仓只此一处这样嵌套（已用正则搜索确认）。
- 教训：`asChild` 注入的 ref 会被子组件内部显式 ref 覆盖；给自定义组件当 tooltip 宿主时看它是否透传 ref。

---

### 导航历史改存到 daemon

- 状态：已完成
- 最近保存：2026-10-22 23:10

上一版用 sessionStorage，用户改为存服务器。旧 sessionStorage 代码已删除（store 的 storage 注入与 4 条测试一并去掉）。

Notes：

- 协议：`navigation.state.get/set` 一对消息，target 走 canonical key 字符串；上限在 `packages/protocol/src/navigation-limits.ts`（访问 20、栈 100、设备 8）。
- daemon：`$PASEO_HOME/navigation-state.json`，`recentVisits` 全局 + `stacksByDeviceKey` 按设备；`NavigationStateStore` 在 bootstrap 创建、注入 Session 与 WebSocket server。
- 能力位 `features.navigationState`：旧 host 不参与同步，避免未知 RPC 报错。
- app：`navigation/navigation-state-sync.ts`；deviceKey 在 localStorage；读回成功前不写（防空栈覆盖），失败 10 次重试后本会话只读。
- 已知：用户当前 daemon（Paseo.app 内置 beta.3）没有这个 RPC，需 daemon 升级后生效；升级前返回按钮仍回归到“刷新即清空”。
- 教训：Session 的 `dispatchInboundMessage` 是 `??` 链，每加一个 dispatch 就加一次复杂度，已到上限；新消息应合进 `dispatchMiscMessage`。
- 教训：`edit` 的 oldText 不要拿“函数签名前几行”当锚点做插入，容易把签名删掉；改完必须看 git diff。

---

### 最近访问行显示 model

- 状态：已完成
- 最近保存：2026-10-22 23:25

副标题从“主机 · 项目”变成“主机 · 项目 · model”，model 取自 session store 的 agent，缺失时不留空段。副标题本来就 `numberOfLines={2}`，长 model id 不会被挤掉。

---

### 最近访问标记 Paseo 子代理

- 状态：已完成
- 最近保存：2026-10-22 23:45

两类 sub agent 行为不同：provider 内部拉起的 target 是 `provider_subagent`，根本不进历史；Paseo 自己起的带 `parentAgentId`，是独立 agent、会进历史，之前与顶层无法区分。

Notes：

- 判断条件 `agent.parentAgentId != null`（由 label `paseo.parent-agent-id` 派生）。
- 行尾徽标与“当前”并排，`subagent` 用 foregroundMuted，“当前”仍用 extraMuted。
- 新 i18n key `sidebar.recentVisits.subagent`，9 语言已补（中文“子代理”）。

---

### 历史列表标记子代理

- 状态：已完成
- 最近保存：2026-10-23 00:05

`AgentDirectoryEntry` 之前没带 `parentAgentId`，所以历史行拿不到。这次补上 Pick 并同步三处映射：session store 的 getAgentDirectory、useAgentHistory、useAggregatedAgents。

Notes：

- UI：`SessionRowBadges` 在“已归档”前加同样样式的“子代理”，仅 `parentAgentId` 非空时显示。
- i18n：新 key `agentList.badges.subagent`，9 语言已补。
- 与最近访问那份用的是两个 key（sidebar.recentVisits.subagent / agentList.badges.subagent），没有合并。

---

### 打开会话时补拉一次备忘录

- 状态：已完成
- 最近保存：2026-10-23 00:40

现象：重启 daemon 后当前会话的备忘录不自动显示，必顶手动新增一条才完整。

真正原因：memo 列表只随 `fetch_agent` 下发，而打开目录里已有的 agent 时 `agent-panel` 只在 `!currentAgent` 时才发 fetch；add 的回复带完整列表，所以手动新增能补全。

Notes：

- 修法：`useAgentMemos` 挂载时若本地没有该 agent 的列表，主动 fetch 一次。
- 门控用 `features.agentMemos`（protocol 里没有单独的 `agentMemosOnFetch` 能力位，后者只是 COMPAT 注释里的名字）。
- 按 `serverId:agentId` 去重；返回不带 `memos` 也保留键，失败则清键重试。

**更正**：上一轮说“要等 daemon 升级”是错的。`/Applications/Paseo.app` 的 asar 里已有 `agentMemosOnFetch`、`navigationState`、`navigation-state.json`，且 `~/.paseo/navigation-state.json` 已生成——新 daemon 早就在跑。`build-mac.sh` 本身也包含新 daemon（`build:desktop` 会先 `build:server:clean`）。

---

### 修复缓存把工作区永久卡在“正在归档”

- 状态：已完成
- 最近保存：2026-10-23 01:10

现象：没做归档操作，workspace 菜单却一直显示“正在归档…”。

链路：菜单的 pending 来自 `isArchiving = workspace.archivingAt !== null || isHidingWorkspace`。`archivingAt` 是 daemon 内存里的瞬时标记（`WorkspaceDirectory.archivingByWorkspaceId`，`archiveByScopeWithPriority` 的 finally 里 clear 并再发一次更新），磁盘上不存（`describeWorkspaceRecord` 硬编码 null）。但客户端把带 archivingAt 的描述写进了 workspace checkpoint，恢复缓存时原样灌回来；daemon 重启后内存清零，永远不会再发一份来纠正它。

Notes：

- 修法：`commitCached` 与 `commitCachedWorkspace` 两条缓存恢复路径都把 `archivingAt` 归零。
- `commitSnapshot`（daemon 全量快照）不动，那份值可信。
- 新增测试：缓存里带 archivingAt，恢复后两个入口都应为 null。

---

### Workspace 菜单增加解开最后归档的 Agent

- 状态：已完成
- 最近保存：2026-10-23 02:05

需求澄清走过的弯路：先被理解为恢复最近归档的 workspace（甚至全局/按 project 找），用户纠正为“该 workspace 下最后归档的 Agent Session”。

Notes：

- 全客户端链路：归档 agent 仍在 session 的 agents map 里，按 `workspaceId` 筛 + `archivedAt` 取最新 → `client.refreshAgent` 解归档 → `navigateToWorkspace` 打开 agent tab。零协议改动，不用重建 daemon。
- hook：`hooks/use-restore-last-archived-agent.ts`，只在调用时读 store，不订阅，避免每行 sidebar 一个订阅。
- 菜单项接两处：`sidebar-workspace-menu.tsx` 与 `workspace-header-menu.tsx`（workspace-screen 里在 `WorkspaceHeaderTitleBar` 内调 hook）。
- i18n：`sidebar.workspace.actions.restoreLastArchivedAgent` + toasts `noArchivedAgent`/`restoreArchivedAgentFailed`，9 语言。
- 教训：`workspace-screen.tsx` 里 menu 的传参在 `WorkspaceHeaderTitleBar`，而 `useWorkspaceHeaderArchive` 在另一个组件，插错位置会编译不过；先确认作用域。

**既有失败**：`workspace-header-menu.test.tsx` 断言 `workspace-menu-restore-hidden-agents-*`，但该入口已在 `dc176007e 移除显式隐藏 Agent 功能` 中删除，测试没同步。与本次改动无关，未动。

---

### 添加到备忘改为对话框填写

- 状态：已完成
- 最近保存：2026-10-23 02:20

Notes：

- 菜单项 `comment.menu.addToTodo` 过去直连 `onAddToTodo(blockText)`；现在 `requestAddToTodo` 只打开 `AssistantMemoSheet`，提交时才写 memo。
- 输入框**预填选中文本**，不是留空。备忘在 rail 是 `numberOfLines={1}`，拼“引用 + 备注”会把备注折叠掉。
- 评论 sheet 的 Enter 处理抽成 `useEnterSubmit` 共用；memo 走 trim、空则禁用，取消不写。
- 测试：`comment-sheet.test.tsx` 加 memo 5 条（预填、编辑、Enter、空白、取消），assistant-comment 目录 31 passed。
- 教训：edit 的 `oldText` 若只取 describe 头行，会把头部行删掉、后面的用例变成顶层裸 `it`；插入新 describe 时要保留原头行。

---

### 选中文本菜单增加复制项

- 状态：已完成
- 最近保存：2026-10-23 02:40

Notes：

- 菜单项顺序：复制 → 评论 → 添加到备忘。复制取选区，无选区取整块。
- 剪贴板失败静默：`MarkdownCommentableBlock` 被 message.tsx 里每个 markdown 块使用，引入 `useToast` 会让所有渲染 markdown 的测试都要带 provider。
- 测试 mock 的 `ContextMenuItem` 需要透传 `testID`，否则新项会插在第一位、现有“点第一个 item 是评论”的用例全碎。

移动端 memo 链路核查（无需改动）：

- 添加：长按 markdown 块 → ContextMenu（compactMode=popover）→ “添加到备忘”，门控是 `useHostFeature(serverId, "agentMemos")`，与平台无关。
- 列表：紧凑布局下 `hasMemosEntry = memosSupported && isCompactFormFactor`，composer tracks row 的 `composer-agent-memos-button` 打开 `AgentMemosSheet`（内含 `AgentMemosRail`）。
- 填写对话框：`AssistantMemoSheet` 用 `AdaptiveModalSheet`，native 下就是 sheet；Enter 只在 web 绑定，native 用按钮。
- 复制：同一菜单，expo-clipboard 在 native 可用。

---

### 最近访问下拉加宽并显示更新时间

- 状态：已完成
- 最近保存：2026-10-23 02:50

Notes：

- `sidebar-recent-visits-menu.tsx` 的 `width` 280 → 360。
- 行尾时间取 `agent.updatedAt`，用 `useCompactTimeAgo`（5m/2h）；抽成 `RecentVisitUpdatedAt` 小组件，tick 只重渲染那个 Text。
- 时间与“当前/子代理”同在 `styles.badges` 这一行，时间排最右。
- 测试 mock 的 `Text` 必须透传 `testID`，否则按 testid 拿不到时间标签。

---

### 纯图标按钮改用 iconButtonChromeStyle

- 状态：已完成
- 最近保存：2026-10-23 03:05

Notes：

- 项目统一的纯图标按钮样式是 `packages/app/src/components/ui/icon-button-chrome.ts` 的 `iconButtonChromeStyle`（6 处复用）：固定 32×32、无边框无底色、hover/pressed/open 给 `interactionHighlight`。
- `quick-replies-bar.tsx` 的 `editChip` 是定制的（2px 内边距 + 透明度），不是项目默认。
- 两处都换成 `iconButtonChromeStyle({ size: "large" })`，图标保持 `ICON_SIZE.lg`（20）。
- 注意：别的文件里也有各自的 `styles.addButton`（如 `quick-replies-editor.tsx`、`git/pull-request-panel/checks-section.tsx`），与这两处无关，没动。

---

### 评论"立即发送"后输入框残留

- 状态：已完成
- 最近保存：2026-10-23 03:25

根因：`handleCommentCommit` 先 `replaceText(nextText)`（写 store + 发布 textReplacement），随后提交路径在发送前就 `setUserInput("")` 同步清了输入框。等 React 提交，replacement 的 effect 才把文本写回 DOM —— 消息发出去了，输入框留着同样内容。

修法：sendNow 不预写，改为 `onSubmitNow` 的注册回调返回 `Promise<AgentInputSubmitResult>`；只有 `noop` 才 `replaceText` 回填。`failed` 由 `submitAgentInput` 自己回填，`queued`/`submitted` 自己清空。

连带：`sendMessageWithContent` 返回结果、`handleSubmit` 改 async、`onSubmitNow` 与 `AgentComposerSection` 两处 props 类型同步。

关于“延迟 1 秒再发”：能绕开竞态，但需 setTimeout + 卸载/重复点击处理，且用户会看见文本闪现、失败判定被拖后，所以不用。

要注意：web 端 `EditingTextInput` 丢弃 `value`，DOM 只由 `replaceText`/`reset` 命令改，所以“store 清空”不等于“输入框清空”，这类问题以后要查命令通道。

---

### 大纲跟随滚动在桌面客户端失效

- 状态：已完成
- 最近保存：2026-10-23 03:40

根因：`rail.web.tsx` 跟随滚动用 `scrollTo({ animated: true })`，平滑动画期间的 `onScroll` 在 500ms 程序化窗口之后到达，`handleListScroll` 把它当用户滚动，`isFollowing` 被永久置 false —— 高亮照常变，列表不再跟随。

修法：跟随改 `animated: false`（瞬时），点击 prompt 的跳转保留动画；`handleListScroll` 加容差：偏移在程序化目标 2px 内算列表自己的滚动。

**未验证**：实际桌面客户端的滚动效果需用户复验；`rail.web.test.tsx` 在 main 上就有 `SyntaxError: Unexpected identifier 'ReactElement'`，与本次无关。

遗留思考：`isFollowing` 一旦为 false 没有恢复入口（设计如此），若以后再出现“高亮不跟随”，先查是否被当成用户滚动关掉。

---

### 备忘弹窗与评论弹窗统一

- 状态：已完成
- 最近保存：2026-10-23 03:55

Notes：

- `comment-sheet.tsx` 只剩一个 `AssistantAnnotationSheet`，用 `variant: "comment" | "memo"` 区分：标题、placeholder、底部按钮不同，引用块与输入框完全一致。删掉了独立的 `AssistantMemoSheet`。
- 备忘内容与评论写 composer 的文本同一套拼法，新增 `buildMemoText`：`formatQuotedBlock` + 空行 + 输入，但去掉末尾 `\n\n`（那是给后续输入留的）。
- 备忘输入为空时按钮可点：此时 `buildMemoText` 只返回引用块。评论仍禁用空输入。
- 测试：`comment-sheet.test.tsx` 按 variant 重写（13 条），`format.test.ts` 加 `buildMemoText` 3 条，目录 38 passed。
- 教训：先把两个 sheet 写成独立组件再回头合并，多了一轮；需求是“一样”时就该一开始用一个组件 + variant。

---

### 大纲跟随滚动：第二版（用户反馈上一版未修好）

- 状态：已完成（待用户复验）
- 最近保存：2026-10-23 04:10

上一版只把跟随改成瞬时滚动，漏了更重要的一层：`isFollowing` 一旦被判为用户滚动就再无恢复入口（只有点某条 prompt 才会 `setIsFollowing(true)`）。web 上鼠标滚轮轻扫过大纲一次，之后滚对话就只剩高亮在动。

本版：

- `lastUserScrollAtRef` 记录用户滚动时间；`activeSeq` 变化且距上次用户滚动 > 1.5s → 恢复跟随，并把 `lastScrollTargetRef` 置 null 强制重滚一次。
- `viewportHeight === 0` 不再直接返回，改为把该行顶部对齐 —— 若 onLayout 从未给出高度，至少还能滚。

**未验证**：未在桌面客户端实机验证。若仍不跟随，下一步要确认回高亮前进时 `activeSeq` 是否真的变化，以及 rail 的 ScrollView 是否有非零高度（需要 devtools 或日志）。

---

### 大纲提示卡片一直闪“加载中”

- 状态：已完成
- 最近保存：2026-10-23 04:30

根因：`PromptDetailContent` 的读取 effect 依赖 `onRequestPromptText`，而这个函数是 `useChatOutline` 里 `useCallback` 依赖 `loadedItems` 产生的 —— 对话重渲染时它每帧都是新引用，effect 跟着重跑：`setFullText(null)` + `setIsLoading(true)` + 重读，卡片就在 loading 与正文间闪。

修法：读取函数放 ref，effect 只锚定 `prompt.seq`。

测试：新建 `prompt-detail.test.tsx`，断言连续 rerender 传入新读取函数时只读一次。

两个坑：

- 测这个文件必须写 `import ... from "./prompt-detail.tsx"`，否则 bare specifier 解析到 `prompt-detail.web.tsx`，里面 `require("./prompt-detail.tsx")` 交给 Node 执行 TS → `SyntaxError: Unexpected identifier 'ReactElement'`。这就是 `rail.web.test.tsx` 一直加载失败的原因。
- 该扩展名导入 tsgo 不允许，需要 `@ts-expect-error TS5097`；测试里还要 `vi.stubGlobal("React", React)`。

**遗留**：`rail.web.tsx` 的 `readPromptTexts` effect 同样依赖这个不稳定函数，会导致整列文案反复重读（有缓存，不影响闪烁但浪费请求），本次未动。

---

### 拆出 prompt-detail-content + 大纲只读缺的提示

- 状态：已完成
- 最近保存：2026-10-23 04:55

第 1 件（`20ddcd425`）：`prompt-detail.tsx` 改名 `prompt-detail-content.tsx`，`sheet.tsx` 与 `prompt-detail.web.tsx` 的 `require("./prompt-detail.tsx")` 改成普通 import，并给它补 `import React`（测试环境 classic JSX 需要）。

- 副产物：`rail.web.test.tsx`（24 条）与 `sheet.test.tsx`（3 条）从此可以运行；sheet 测试要补主题键（`borderWidth`/`fontWeight`/`iconSize` 等）并 mock `@/contexts/toast-context`，否则会把 toast-host 整套样式拖进来。
- `rail.web.browser.test.tsx` 现在也能加载，但它属于 browser project，本地未装 Playwright 会报错；跑单元测试用 `--project unit`。

第 2 件（`e18a14fe6`）：`rail.web.tsx` 读整列文案的 effect 把 `onRequestPromptText` 放进 ref，并用 `promptTextsRef` 跳过已有文本的 seq；列表新增一条时只读那一条。补测试：2 条→3 条只读第 3 条。`--project unit` 下 chat-outline 目录 60 passed。

---

### 备忘栏「清空」按钮

- 状态：已完成（`f92a708d9`）
- 最近保存：2026-10-23 05:10

需求：备忘栏头部 `+` 左边加清空，必须先确认。

- `use-agent-memos.ts` 新增 `clearMemos`：按当前列表顺序逐条调既有 `deleteAgentMemo`，每条回来的全量列表覆盖 store。不并行：reply 都带全量列表，并行会让后到的旧列表覆盖新列表。
- `agent-memos-rail.tsx`：头部动作区（`headerActions`）里 `ListX` 图标 + `InlineConfirm`（testID `agent-memo-clear`），仅 `memos.length > 0` 时显示；失败静默。
- i18n `agentMemos.clear` × 9。
- **未新增协议 RPC**：新 RPC 要走 feature gate，用户当前 daemon 上按钮会被隐藏，得重建 host 才生效；逐条删除现有 daemon 立刻可用，备忘量是个位数。
- 未新增测试：该目录本来没有测试文件，纯 UI 确认流程。验证：lint、typecheck、format 全过。

---

### 工具卡片标题显示意图字段

- 状态：已完成（`ba234e223`）
- 最近保存：2026-10-23 05:35

需求：工具卡片标题原来只显示 path，希望像 `mcp__fsearch__grep packages/protocol` 这样一眼能看出意图，比如先显 query。

改 `packages/protocol/src/tool-call-display.ts` 的 unknown 分支（MCP 工具在 daemon 里都是 unknown detail）：取一个意图字段 + 一个目标字段，用 `·` 连接。

- 意图顺序：`query`、`pattern`、`patterns`、`substring_pattern`、`name_path_pattern`、`name_path`、`title`、`url`、`prompt`
- 目标顺序：`path`、`relative_path`、`projectPath`、`cwd`
- 数组取前两项，多于两个补 `…`；值里的空白折成一行；目标走 `stripCwdPrefix`
- **`command` 刻意不取**：既有测试 `does not derive command summary from unknown raw detail` 明确禁止，避免无关字段变成摘要
- 删掉旧的 `readUnknownInputFilePath`，改 `buildUnknownInputSummary`

验证：`build:client`；`tool-call-display.test.ts` 14 passed（新增 5）、`types/stream.test.ts` 65 passed；lint、typecheck、format 全过。

---

### 工具标题摘要：字段清单扩充与「最多两段」

- 状态：已完成（`965d25b27`、`8eb79c9e9`）
- 最近保存：2026-10-23 06:05

约束：多字段同时命中只取两个片段；字段按顺序排，不按工具名特判。

- `965d25b27`：固定「意图 + 目标」两段，各取第一个命中的键；数组最多两个值，多于两个补 `…`；补测试锁定七组候选键同时命中时仍只有两段。
- `8eb79c9e9`：意图列表补 `symbol`、`symbolName`、`symbol_name`、`memory_name`、`uri`、`initialPrompt`、`message`；目标列表补 `filePath`、`file_path`、`file`、`projectPath`、`project_path`、`directory`、`dir`。同一资源被两段重复写时只显示一次。

**踩坑**：改 `packages/protocol` 后不跑 `npm run build:client`，app 侧测试会跑旧的编译产物，新字段全部返回 undefined。先 build 再跑测试。

---

### 评论弹窗 Cmd/Ctrl+Enter 直接发送

- 状态：已完成（`825d00fc9`）
- 最近保存：2026-10-23 06:30

需求：评论输入框按 Cmd+Enter 等同点「直接发送」。

- `comment-sheet.tsx`：keyPress 事件类型补 `metaKey`/`ctrlKey`；`useEnterSubmit(onSubmit, onSendNow?)` 分流：修饰键 Enter 走 `onSendNow`，没有该动作（memo 变体）退回 `onSubmit`；裸 Enter 附加；Shift+Enter 换行；IME 不触发。
- 调用处：`useEnterSubmit(handleSubmit, isMemo ? undefined : handleSendNow)`。
- 测试 +3：Cmd+Enter、Ctrl+Enter、memo 的 Cmd+Enter 等同提交。`src/assistant-comment` 5 个文件 41 passed。

---

### 备忘栏清空按钮：图标与 tooltip

- 状态：已完成（`fa24f2b27`）
- 最近保存：2026-10-23 06:45

- 图标 `ListX` → `Trash2`，与行内删除同一套语言，省得用户多想一步。
- 加 tooltip（文案 `agentMemos.clear`），与右侧「+」参数一致：`delayDuration={250}`、`enabledOnDesktop`、`side="top"`、`align="end"`。
- **坑**：`TooltipTrigger asChild` 会把 ref 注入子元素，而 `InlineConfirm` 是函数组件接不了 ref → 外面套一层 `View`（`collapsable={false}`）当触发器，确认按钮在它里面。与 `memoButtonHost` 同一手法。
- **坑**：直接内联写会让 JSX 嵌套到 7 层，超过 lint 上限 6。拆成 `MemoClearButton` 组件。

---

### History 行操作图标闪烁与 tooltip

- 状态：已完成（`2768626ec`）
- 最近保存：2026-10-23 07:00

**闪烁根因**：`SessionRow` 的 hover 挂在整行 `Pressable` 的 `onHoverIn/onHoverOut` 上，而行内有归档、删除两个 Pressable —— 正是 `docs/hover.md` 的失败模式一。指针进入内层 Pressable → 外层 `onHoverOut` → 动作区隐藏 → 指针落回行上 → `onHoverIn` → 循环。

**修法**：外层普通 `View` 用 `onPointerEnter/onPointerLeave` 跟踪 hover（非冒泡），内层 `Pressable` 只管按下；行高亮也改由 `isHovered` 驱动。

**tooltip**：归档/删除各一个，文案与 `accessibilityLabel` 同源。删除按钮的 tooltip 外套一层 `View`（`InlineConfirm` 是函数组件接不了 ref）。抽了 `RowActionTooltip` 避免嵌套过深。

验证：lint、typecheck（exit 0）、format 全过；`agent-list.tsx` 无既有测试文件。**待用户实机复验**闪烁是否消失。

---

### i18n 通用动词复用

- 状态：已完成（`c27df77cf`）
- 最近保存：2026-10-23 07:20

需求：按钮已在具体功能里，文案只留动词（管理 / 添加 / 清空），别再缀「备忘」「常用回复」；能复用通用 key 就不要自己维护。

- `common.actions` 新增 `manage`、`add`、`clear`、`edit`、`delete`、`save`（×9 语言）。
- 删除专用键：`composer.quickReplies.edit`、`agentMemos.add`、`agentMemos.clear`、`agentMemos.edit`、`agentMemos.delete`、`agentMemos.save`（×9）。
- 调用处改走 common：`quick-replies-bar.tsx`（manage）、`agent-memos-rail.tsx`（add/clear/edit/delete/save）、`comment-sheet.tsx`（add）、`agent-memo-composer.tsx`（add）。
- 保留：`composer.quickReplies.editTitle`（编辑面板标题）、`agentMemos.toggle`/`sheetTitle`/占位符（需要名词）。

验证：lint、typecheck、format 均 exit 0；`agent-memos` + `assistant-comment` + `quick-replies` 5 个文件 41 passed。

---

### History 行操作图标常驻显示

- 状态：已完成（`ee2e9feb2`）
- 最近保存：2026-10-23 07:35

需求：归档/删除图标一直显示，不要 hover 才出现。

- `agent-list.tsx`：去掉 `AgentRowActions` 的 `visible` 参数与 `pointerEvents`/`rowActionsHidden`，删 `rowActionsHidden` 样式；调用处不再传 `isHovered`。
- 行背景高亮仍由 `isHovered` 驱动（`onPointerEnter/Leave`）。
- 列宽本就是固定 64，常驻不引起布局跳变。

验证：lint、typecheck、format 均 exit 0。
