# 统一登录原型项目

面向 Codex 本地环境的统一登录原型，使用 `skill + MCP` 结构为 `GitHub` 和 `Google` 提供统一认证入口。

## 快速开始

公开仓库场景下，推荐先按“项目级接入”完成最小配置。

1. 进入目录：

```powershell
cd .\mcp\service-auth-gateway
```

2. 启动服务：

```powershell
npm start
```

3. 运行测试：

```powershell
npm test
```

4. 运行 smoke test：

```powershell
npm run smoke
```

5. 选择接入方式：
   - 项目级接入：使用仓库内 `mcp/service-auth-gateway/.mcp.json`
   - 全局接入：在你自己的 Codex 配置中注册 `service-auth-gateway`

6. 首次登录最短路径：
   - GitHub：准备 PAT，走 `auth_begin` + `auth_complete`
   - Google：准备你自己的 OAuth client 信息，走 `browser_oauth`

更完整的外部用户配置说明见：

- [references/PUBLIC_SETUP_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login/references/PUBLIC_SETUP_GUIDE.md)

## 主要文档

- [DOCUMENTATION_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login/DOCUMENTATION_GUIDE.md)
  - 当前项目全部说明文档的导航入口
- [PROJECT_CONTEXT.md](D:/project/CodexWorkSpace/2026-04-29-login/PROJECT_CONTEXT.md)
  - 项目主说明与持续维护上下文
- [references/MCP_AND_PROJECT_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login/references/MCP_AND_PROJECT_GUIDE.md)
  - 面向新手的 MCP 与项目详细说明
- [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login/references/OPERATION_MANUAL.md)
  - 面向实际使用的正式操作手册
- [references/PUBLIC_SETUP_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login/references/PUBLIC_SETUP_GUIDE.md)
  - 面向外部用户的公开安装与配置说明

## 当前能力

- GitHub `manual_token`
- 业务路由决策：
  - `auth_resolve_route`
- GitHub 缺口补全 V1 只读工具：
  - `github_repository_get`
  - `github_branch_list`
  - `github_pull_request_list`
  - `github_pull_request_get`
  - `github_issue_list`
  - `github_issue_get`
- GitHub 第一批协作写工具：
  - `github_issue_create`
  - `github_issue_comment_create`
  - `github_pull_request_create`
  - `github_pull_request_comment_create`
  - `github_pull_request_review_create`
- GitHub 仓库链接发布：
  - `github_publish_prepare`
  - `github_publish_execute`
- Google `browser_oauth`
- Google `manual_refresh_token`
- Google 本地 loopback OAuth 回调
- 登录状态可视化摘要 `auth_status_overview`
- GitHub / Gmail 状态卡 `auth_status_cards`
- 单卡在线校验 `auth_refresh_status_card`
- 本地 HTML 面板 `ui_open_panel`

## 当前定位

- 当前已实现认证层、GitHub 最小发布链路、GitHub 缺口补全 V1、GitHub 聊天统一入口第一阶段，以及体验层状态卡和本地面板
- 当前已实现“官方优先、不可依赖时回退本地”的 GitHub 业务路由层，当前本地回退已覆盖读操作与第一批协作写操作
- 当前 `service-auth-router` 已升级为 GitHub 自然语言统一入口：
  - 统一接收登录、状态、仓库 / 分支 / PR / issue 读操作、第一批协作写操作、当前项目发布
  - 统一采用“先补参数、再判路由、写前确认”的聊天层编排方式
- 当前尚未切到显式 `@助手` 入口；后续目标是提供更通俗、边界更清晰、可全局复用的前台统一入口，同时后台继续保持现有实现结构
- 当前项目内已提供本地 MCP manifest；若要全局发现该服务，需要由用户在自己的 Codex 配置中完成注册
- 当前已支持“提供 GitHub 仓库地址即可预览并推送当前项目”这一条最小发布路径
- 当前体验层额外提供：
  - GitHub / Gmail 双状态卡
  - 单卡在线刷新
  - 首屏先展示缓存摘要、再自动在线校验的本地面板体验
- 当前不承诺直接接管官方 `@gmail/@github` 入口

## 当前边界

- 当前已统一：
  - GitHub login
  - GitHub status / validate / logout
  - GitHub repository / branch / PR / issue 读操作
  - GitHub issue / PR 第一批协作写操作
  - GitHub current-project publish
  - GitHub / Gmail 状态卡与本地状态面板
- 当前未统一或未实现：
  - 官方 `@github` / `@gmail` 入口接管
  - 显式 `@助手` 聊天入口
  - 跨项目全局复用的统一聊天入口
  - GitHub 标签、merge、approve / request changes、release 等更完整写操作
  - Google 业务聊天入口统一
  - 面板内直接发起 GitHub / Gmail 登录
  - 面板内 Gmail 注销

## 浏览器说明

- 当前项目内的 Google OAuth 联调优先显式调用 `Chrome`
- 必要时也可手动复制授权 URL 到 `Chrome`

## 关键目录

- `skill/service-auth-router`
- `mcp/service-auth-gateway`
- `references/provider-matrix.md`
- `references/LOGIN_STATUS_USAGE.md`
- `references/OPERATION_MANUAL.md`
