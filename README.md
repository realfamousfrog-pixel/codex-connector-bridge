# 统一登录原型项目

面向 Codex 本地环境的统一登录原型，使用 `skill + MCP` 结构为 `GitHub` 和 `Google` 提供统一认证入口。

## 主要文档

- [DOCUMENTATION_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login/DOCUMENTATION_GUIDE.md)
  - 当前项目全部说明文档的导航入口
- [PROJECT_CONTEXT.md](D:/project/CodexWorkSpace/2026-04-29-login/PROJECT_CONTEXT.md)
  - 项目主说明与持续维护上下文
- [references/MCP_AND_PROJECT_GUIDE.md](D:/project/CodexWorkSpace/2026-04-29-login/references/MCP_AND_PROJECT_GUIDE.md)
  - 面向新手的 MCP 与项目详细说明
- [references/OPERATION_MANUAL.md](D:/project/CodexWorkSpace/2026-04-29-login/references/OPERATION_MANUAL.md)
  - 面向实际使用的正式操作手册

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
- 当前项目内已提供本地 MCP manifest，且当前用户环境已将 `service-auth-gateway` 注册到全局 Codex MCP 配置
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
  - GitHub 标签、merge、approve / request changes、release 等更完整写操作
  - Google 业务聊天入口统一
  - 面板内直接发起 GitHub / Gmail 登录
  - 面板内 Gmail 注销

## 浏览器说明

- 当前用户环境只有 `Chrome` 也不影响本项目设计
- 当前项目内的 Google OAuth 联调优先显式调用 `Chrome`
- 必要时也可手动复制授权 URL 到 `Chrome`

## 关键目录

- `skill/service-auth-router`
- `mcp/service-auth-gateway`
- `references/provider-matrix.md`
- `references/LOGIN_STATUS_USAGE.md`
- `references/OPERATION_MANUAL.md`
