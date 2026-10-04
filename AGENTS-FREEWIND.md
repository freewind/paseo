# AGENTS-FREEWIND.md

本项目是 [getpaseo/paseo](https://github.com/getpaseo/paseo) 的 fork（`freewind/paseo`）。
通用开发规范、架构说明、平台约定一律以 [CLAUDE.md](CLAUDE.md) 和 `docs/` 为准，本文件只写 fork 自己的约束。

## 分支结构

只有一条开发分支：

```
origin/main               ← 唯一的开发分支，也是唯一的真源
      │
      │  仅在用户明确要求时同步
      ▼
upstream/main
```

- 所有改动直接落在 `main` 上，远端 `origin/main` 就是当前唯一可信的状态。
- 历史会被反复重写，换来的是一条线性的、按功能排列的 commit 历史：从旧到新读一遍就知道
  这个 fork 在什么基础上做了哪些功能、为什么做、怎么做的。
- **`upstream` 默认不碰。** 未经用户明确要求，禁止执行任何会拉取或合并上游代码的操作
  （`git fetch upstream`、`git pull upstream`、`git rebase upstream/main` 等）。开工前的同步
  只拉自己的 `origin/main`。

## 工作流程

### 新增一个功能

1. `git pull --no-rebase origin main`，把本地同步到自己已推送的状态。
   **这一步失败就停下报告用户**，不继续开发，也不要自行改用其他拉取方式绕过。
2. 判断这个改动属于**基础改动**还是**功能改动**（见下节）。
3. 在 `main` 上开发。
4. 提交。功能改动必须是**一条** commit；如果是完善已有功能，见下节。
5. 验证：按下面「验证要求」一节执行，typecheck、测试、出包三项都要过。
6. **必须 push。** 普通提交 `git push origin main`；凡改写过历史的用
   `git push --force-with-lease origin main`。没有 push 到 `origin/main` 的改动一律不算交付。

### 完善已有功能

- **不要新增 commit 去叠加。** 哪怕该功能在历史上已是若干条 commit 之前的，也直接改原来那条
  功能 commit。
- 定位与改写：

  ```bash
  # 找到那条功能 commit（当前 hash）
  git log --oneline upstream/main..main

  # 用 autosquash 把改动并入目标 commit
  git commit --fixup=<目标 hash>
  git rebase -i --autosquash upstream/main
  ```

  需要在 rebase 中途改内容时用 `git rebase -i upstream/main` 把目标行标成 `edit`，停下后
  修改再 `git rebase --continue`。

- 因为历史会被重写，**允许 force push** `origin/main`，用 `--force-with-lease` 防止覆盖他人的更新。
- rebase 之后，`main` 相对 `upstream/main` 的 commit 列表会整体换 hash，这是预期行为。
- **修自己功能引入的缺陷，同样并入那条功能 commit，不新开 `fix`。** 例：TTS 朗读上线后发现
  Electron 下语音列表查询不返回，就把修复并进 TTS 那条，而不是加一条 `fix(tts)`。
- 上述 `--autosquash` 流程以 `upstream/main` 为参照点，只是**比较基线**，不代表允许拉取上游；
  改写完成后照样只 push 到 `origin/main`。

### 同步上游（仅在用户明确要求时）

**默认禁止。** 除非用户明确要求同步上游，否则不得执行本节任何命令。同步是独立的、需明确
指令的动作，不在任何开发任务的前置步骤里。

```bash
git fetch upstream
git checkout main
git rebase upstream/main        # 把我们的 commit 重放到新的上游之上
# 按「验证要求」一节验证
git push --force-with-lease origin main
```

rebase 我们的 commit 时可能与上游改动冲突。解决原则：**以上游新代码为基准，保留我们功能的
语义**，不为省事丢弃任一侧的功能。

- 同步后 `packages/protocol`、`packages/plugin`、`packages/client` 的 `dist/` 产物必然落后于
  刚拉进来的源码，下游包的 typecheck 会报出一片「属性不存在 / 签名不对应」的错误。这不是代码
  有问题，必须先重建这三个包：

  ```bash
  npm run build:clean -w @getpaseo/protocol
  npm run build:clean -w @getpaseo/plugin
  npm run build:clean -w @getpaseo/client
  ```

### 同步上游时处理功能冲突

rebase 停下来只是第一类问题，另两类根本不会表现为冲突，必须靠验证主动找出来。三类都要处理，
漏掉任何一类都会把一个坏状态推到 `origin/main`。

**一、rebase 停下的文本冲突**

- 逐个解决，不许用 `-X ours` / `-X theirs` 整体取一侧。两侧改的是同一处代码，取一侧就等于
  悄悄丢掉另一侧的功能。
- 基准是**以上游新代码为写法基准，保留我们功能的语义**：签名、参数、导出结构以上游为准，
  我们新增的字段和行为接上去；纯粹的重命名、格式化、搬文件以上游为准。
- 上游重写了我们依赖的内部结构时（例如换了 RPC 名、换了类型导出位置），要顺着上游改我们的
  调用点，而不是在旧结构上加兼容层。

**二、上游改了某个功能，牵动我们已实现的功能**

- 这类不报冲突。rebase 会干净地通过，坏在之后：全仓 typecheck 报「属性不存在 / 签名不对应」，
  或测试挂了。这就是为什么同步完必须跑完整验证，不能只看 rebase 是否跑完。
- 典型：上游给某个函数加了参数并改了返回类型，我们所有调用点仍按旧签名写，于是全仓编译不过。
- 处理方式是改我们的调用点去适配新签名，改完补一条能证明新行为的测试。不要为了让 typecheck
  变绿而回退上游的签名，也不要给旧签名留兼容壳。

**三、产物与类型漂移造成的假错误**

- `packages/protocol`、`packages/plugin`、`packages/client` 的 `dist/` 落后于刚拉进来的源码时，
  下游包（`client`、`server`、`app`）从 `dist/*.d.ts` 取到的还是旧类型，会报出一片看起来很像
  代码写错的错误。
- 判断顺序：**先按上一节重建这三个包，再看错误是否消失。** 消失的是假错误，不是本次同步要
  修的问题；仍然存在的才是真问题，按第二类处理。
- 反过来，若跳过重建直接改代码，就会照着假错误去改本来正确的调用点，越改越坏。

**验证与交付**

- 同步走完 `git rebase --continue` 后，跑一遍「验证要求」的三项：typecheck、相关测试、出包。
- rebase 改写了历史，最后一律 `git push --force-with-lease origin main`。
- 我们自己的 commit 因为重放而整体换 hash，这是预期行为，不算改动；同步本身不产生新 commit，
  冲突解决和功能适配都并进被重放的那条。

## Commit 排序

`main` 上的 commit 从旧到新按这个顺序排列：

1. **基础 / 共用改动**（`chore`、`refactor`、`docs`、`build`）——构建脚本、日志基础设施、
   依赖调整、文档、平台配置等。它们被多个功能共用，不改变用户可见行为，所以排在最前面，
   后续功能 commit 直接依赖它们。
2. **功能改动**（`feat`、`fix`）——我们真正给产品加的东西，按添加顺序排列。

新加的基础改动插到第一个功能 commit 之前；新加的功能改动追加到最后。

## Commit 规范

### 一个功能一个 commit

- **一个独立功能 = 一条 commit。** 一个功能绝不拆成多条；多个功能也绝不塞进同一条。
- 不按实现步骤切分。示例：TTS 朗读是**一个**功能，只对应**一条** commit，而不是「加依赖 /
  加设置项 / 加 hook / 接入界面」四条。
- 一个功能改了多个文件、多个模块，仍然只算一条，改动全部放在这条里。
- 几个功能共用的前置改动，按上面的排序规则单独成一条 `chore`，放在它们前面。
- **琐碎同类改动合成一条。** 一批高度相似的小改动（同一功能的 i18n 文案标记、同一处的
  埋点、同类按钮的按下反馈）不逐条开 commit，合并成一条，它们本质是同一件事的收尾。

### 语义前缀

每条 commit 的 title 必须以下列前缀之一开头，让读历史的人一眼看出这条属于基础改动还是功能
改动、是新增还是修复：

| 前缀              | 用于                                                     |
| ----------------- | -------------------------------------------------------- |
| `feat(范围):`     | 新增用户可见的功能                                       |
| `fix(范围):`      | 修复缺陷（既含上游存在的问题，也含我们自己功能里的问题） |
| `refactor(范围):` | 不改变行为的内部重构                                     |
| `chore(范围):`    | 构建脚本、依赖、配置、平台杂项                           |
| `docs(范围):`     | 文档                                                     |

前缀表只允许上表这五种。表外的词（`update`、`style`、`perf`、`test` 等）一律归入最接近的一项：
用户可见的改进归 `feat`，修问题归 `fix`，不改变行为的整理归 `refactor`，其余归 `chore`。

**范围必须写。** title 只有 `feat:` 而没有 `feat(范围):` 视为不合格。

**title 里不出现装饰字符。** 🌿 等标记只属于产品界面，不写进 commit title。

### 半成品一律禁止

- **不允许提交半成品。** 未接线的逻辑、留空的实现、假数据、`TODO`、注释里写着「后续实现」
  却当功能交付的代码，都不能进 commit。
- **有意的占位允许，但必须写明是占位。** 例如只预留布局位置、后续 commit 才接上真正功能，
  这类 commit 要在 body 里写清「这是有意的占位，功能本体在后续 commit 落地」，并说清占位
  位置将来由谁填。
- 占位元素同样是自研产物，按下面「🌿 标记」加 🌿。

### 文案一律中文

- **title**：`前缀(范围): 中文说明这个 commit 干了什么`。范围用英文模块名（`app`、`chat`、
  `composer`、`settings`、`server`、`android`），说明用中文。
  - 示例：`feat(chat): 把 patch/diff 代码块渲染成统一 diff`
  - 示例：`fix(app): 让 Android 状态栏图标跟随应用主题反色`
  - 示例：`chore(android): 最低支持版本降到 API 28`
- **body**：详细到「只看 commit 就知道做了什么、为什么做」，至少写清：
  - **动机**：为解决什么问题，用户的原始要求是什么。
  - **做了什么**：改了哪些模块、加了哪些字段 / hook / 组件 / 设置项、界面上的实际表现。
  - **判断与取舍**：为什么这样实现、排除了哪些方案、有什么前提或约束。
  - **来源**：若由旧 commit 整理而来，注明 `整理自：<hash>、<hash>`。

## 🌿 标记

- **所有我们自己新增或改动的用户可见元素，必须带 `🌿` 标记。** 包括 i18n 文案、菜单项、
  设置项、按钮、徽标、占位块。
- 目的：用起来一眼看出哪些是 fork 自己加的、哪些是上游原样的，方便日后分辨与继续改进。
- 复用到上游 key 的地方（如上游侧栏菜单与我们的头部菜单共用
  `sidebar.workspace.actions.*`），**不改 key 的值，只在我们自己的调用点加前缀**，避免把
  上游界面也打上标记。
- 纯数字徽标没有自己的文案时，在其无障碍标签等唯一可加前缀的文本上加。

## 验证要求

每条 commit 都要能通过以下三项，缺一不可：

1. **typecheck 零错误**：先重建被依赖包的产物，再 `npm run typecheck --workspaces --if-present`。
   下游包（`client`、`server`、`app`）从 `dist/*.d.ts` 取类型，所以 `protocol`、`plugin`、`client`
   三个包的 `src/` 一旦动过就必须先 `build:clean`，否则报出来的错误是产物陈旧造成的假象：

   ```bash
   npm run build:clean -w @getpaseo/protocol
   npm run build:clean -w @getpaseo/plugin
   npm run build:clean -w @getpaseo/client
   npm run typecheck --workspaces --if-present
   ```

   只有网站站点的 typecheck 依赖 `website` 自己的产物；本 fork 不用单独跑 `build:protocol`。

2. **本次改动实际影响的测试通过**。
3. **能出包**：Android APK 与本机 Intel 版 mac 应用都要能构建成功。

为控制出包成本，允许这样安排：整批历史重写后在 `main` 的最新一条上统一出包一次；而凡是
触及构建与平台配置的 commit（`packages/app/app.config.js`、`package.json`、依赖与
lockfile、`build-*.sh`、`packages/desktop` 打包流程）必须单独出包验证，不能只靠最后一次。

## 与上游的关系

- 上游：`upstream` → `github.com/getpaseo/paseo`；自己的远程：`origin` → `github.com/freewind/paseo`。
- 上游原有文件一律不改动；我们自己的规矩、结论、脚本只放在本文件或新增文件里。
