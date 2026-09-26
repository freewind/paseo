# AGENTS-FREEWIND.md

本项目是 [getpaseo/paseo](https://github.com/getpaseo/paseo) 的 fork（`freewind/paseo`）。
通用开发规范、架构说明、平台约定一律以 [CLAUDE.md](CLAUDE.md) 和 `docs/` 为准，本文件只写 fork 自己的约束。

## 分支结构

```
upstream/main
      │  跟随上游同步
      ▼
     main                 ← 上游代码 + 我们自己的非功能性基础改动
      ├── feature/fix       修复类改动
      ├── feature/enhance   对既有功能的小修改
      ├── feature/new       独立的新功能
      └── integration       上面三个分支的合并结果，用于构建和发布
```

### main

- 跟随上游。`git fetch upstream` 后把上游新 commit 合入，保持与上游基本一致。
- 允许承载**我们自己的非功能性基础改动**，例如构建脚本、日志基础设施、文档、依赖调整等。
  这类改动不改变用户可见行为，且往往被多个功能共用，因此不放在功能分支里。
- `main` 上不放任何功能性改动。

### feature 分支

固定三条，不新增：

- `feature/fix`：修复 upstream 存在的问题（例如沉浸式下状态栏白底白图标、新建项目未选中匹配目录行）。
- `feature/enhance`：既有功能的入口、设置项、开关这类小改动（例如头部菜单加 Rename 入口、语音按钮显示开关）。
- `feature/new`：我们自己新增的独立功能（例如 TTS 朗读、回合页脚统计、diff 代码块渲染）。

每条分支都从 `main` 切出，且**必须能独立编译通过**。

### integration

- 三条 feature 分支全部合并的结果，是实际构建和发布用的分支。
- 分支间有冲突时，**在 integration 上解决**。
- 合并完成后，`integration` 的代码应与「所有功能叠加后」的预期状态一致。

## 工作流程

### 更新上游

```
git fetch upstream
git checkout main
git merge upstream/main        # 或 rebase
git push origin main
```

然后把三条 feature 分支各自 rebase 到新的 `main`，再合回 `integration`。

### 新增一个功能

1. 判断它属于 `fix`、`enhance` 还是 `new`，切到对应分支（从最新 `main` 切）。
2. 在该分支上开发并提交。
3. 合回 `integration`；有冲突就在 `integration` 上解决。
4. 推送。

### 修改已有功能

- **不要新增 commit 去叠加**。直接改原来那条功能 commit（`git commit --amend` 或交互式 rebase
  的 `squash` / `edit`），让它始终保持「一个功能一条 commit」。
- 因为历史会被重写，**允许 force push** `origin/main`、`origin/integration` 和对应的 feature 分支。

## Commit 规范

### 一个功能一个 commit

- **一个独立功能 = 一条 commit。** 一个功能绝不拆成多条 commit；多个功能也不塞进同一条 commit。
- 不按实现步骤切分。示例：TTS 朗读是**一个**功能，只对应**一条** commit，而不是「加依赖 / 加设置项 / 加 hook / 接入界面」四条。
- 一个功能如果同时改了多个文件、多个模块，仍然只算一条 commit，改动全部放在这条里。
- 几个功能共用的前置改动单独成一条 commit，或按下面的规则放进 `main`。

### 文案一律中文

- title 和 body **全部用中文**（API 名、文件名、字段名等必要标识可保留原文）。
- **title**：用 conventional 前缀 + 中文说明这个 commit 干了什么，让人一眼看出是新增、修改还是删除。
  - 格式：`feat(范围): 做了什么` / `fix(范围): 修了什么` / `refactor(范围): 重构了什么` / `chore(范围): 杂项`。
  - 示例：`feat(chat): 把 patch/diff 代码块渲染成统一 diff`、`fix(composer): 修复 Android 上长按菜单不出现`。
- **body**：要详细，让人觉得「只看 commit 就知道做了啥」，至少写清这些：
  - 这个功能/修改是**为了解决什么**（动机、用户的原始要求）。
  - **具体做了哪些事**：改了哪些模块、加了哪些字段/hook/组件/设置项、界面上的表现。
  - **关键判断与取舍**：为什么这样实现、排除了什么方案、有什么前提或约束。
  - 如果这个 commit 是从多条旧 commit 整理来的，注明 `整理自：<hash>、<hash>`。

## 与上游的关系

- 上游：`upstream` → `github.com/getpaseo/paseo`；自己的远程：`origin` → `github.com/freewind/paseo`。
- 上游原有文件一律不改动；我们自己的规矩、结论、脚本只放在本文件或新增文件里。
