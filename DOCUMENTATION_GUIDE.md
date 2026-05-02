# 文档导航

## 文档说明

这份文档是当前项目所有说明文档的总入口。

如果你不知道应该先看哪一份文档，就从这里开始。

它的职责不是重复正文，而是告诉你：

- 你遇到什么问题时该看哪份文档
- 每份文档各自负责什么
- 后续扩写时应优先更新哪些地方

## 按使用目标导航

### 想快速了解项目

看：

- [README.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/README.md)

### 想看项目目标、限制、维护上下文

看：

- [PROJECT_CONTEXT.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/PROJECT_CONTEXT.md)

### 想理解 MCP 和整体设计

看：

- [references/MCP_AND_PROJECT_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/MCP_AND_PROJECT_GUIDE.md)

### 想实际操作项目

看：

- [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)

### 想查看登录状态说明

看：

- [references/LOGIN_STATUS_USAGE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/LOGIN_STATUS_USAGE.md)

### 想看 provider / bundle 对照

看：

- [references/provider-matrix.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/provider-matrix.md)

## 按读者类型导航

### 新手

推荐顺序：

1. [README.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/README.md)
2. [references/MCP_AND_PROJECT_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/MCP_AND_PROJECT_GUIDE.md)
3. [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)

### 维护者

推荐优先看：

1. [PROJECT_CONTEXT.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/PROJECT_CONTEXT.md)
2. [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)
3. [references/provider-matrix.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/provider-matrix.md)

### 实际操作者

推荐优先看：

1. [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)
2. [references/LOGIN_STATUS_USAGE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/LOGIN_STATUS_USAGE.md)

## 按阶段导航

### 第一次接触项目

先看：

- [README.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/README.md)
- [references/MCP_AND_PROJECT_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/MCP_AND_PROJECT_GUIDE.md)

### 准备开始登录

先看：

- [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)

### 准备排查问题

先看：

- [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)
- [references/LOGIN_STATUS_USAGE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/LOGIN_STATUS_USAGE.md)

### 后续新增能力时应该更新哪些文档

优先更新：

- [PROJECT_CONTEXT.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/PROJECT_CONTEXT.md)
- [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/OPERATION_MANUAL.md)

如有必要，再同步更新：

- [README.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/README.md)
- [references/MCP_AND_PROJECT_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/MCP_AND_PROJECT_GUIDE.md)
- [references/LOGIN_STATUS_USAGE.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/LOGIN_STATUS_USAGE.md)
- [references/provider-matrix.md](D:/project/CodexWorkSpace/2026-04-29-login-experience/references/provider-matrix.md)

## 文档角色说明

### `README.md`

- 项目简要介绍与最短入口

### `DOCUMENTATION_GUIDE.md`

- 所有说明文档的根目录导航页

### `PROJECT_CONTEXT.md`

- 项目目标、边界、约束、维护上下文主文档

### `references/MCP_AND_PROJECT_GUIDE.md`

- 面向新手的原理说明文档

### `references/OPERATION_MANUAL.md`

- 正式操作手册

### `references/LOGIN_STATUS_USAGE.md`

- 登录状态专题说明

### `references/provider-matrix.md`

- provider 与 capability bundle 参考表

## 当前已实现与未实现边界

### 当前已实现

- 启动本地 MCP 服务
- 运行测试和 smoke test
- 查看 provider 列表
- 查看登录状态摘要
- 查看 GitHub / Gmail 状态卡
- 对单张状态卡执行在线校验
- 查看业务请求路由决策
- GitHub 聊天统一入口第一阶段
- GitHub `manual_token` 登录
- GitHub 仓库信息 / 分支 / PR / issue 只读操作
- GitHub issue / PR 第一批协作写操作
- GitHub 仓库链接发布预览 / 执行
- Google `browser_oauth` / `manual_refresh_token` 登录
- 状态校验与注销
- 本地 HTML 面板 `ui_open_panel`

### 当前未实现

- 官方 `@gmail/@github` 入口接管
- 在本地 MCP 中直接实现 Gmail 发信/读信
- 在本地 MCP 中直接实现 GitHub 标签修改、merge、release 等更完整写操作
- Google 业务聊天入口统一
- 面板内直接发起 GitHub / Gmail 登录
- 面板内 Gmail 注销
- 更完整桌面级交互面板
