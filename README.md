# Codex Connector Bridge

面向 Codex 本地环境的统一登录与能力补全原型。

## 项目背景

当前在 API 登录路线与当前本地环境下，官方 `@github`、`@gmail`、`@google-drive` 等插件登录能力会失效，或者至少不可稳定依赖。

这个项目的目标，不是接管官方云端 connector 登录态，而是通过本地 `skill + MCP` 路径，把缺失的认证、状态、发布和部分业务能力补回来。

## 当前项目在解决什么问题

- 让 Codex 在本地具备一套可持久化的 GitHub / Google 认证入口
- 在官方插件登录能力失效或不可依赖时，提供本地可控的补全路径
- 为 GitHub 补齐当前最急需的业务能力：
  - 仓库 / 分支 / PR / issue 读操作
  - 第一批 issue / PR 协作写操作
  - 当前项目直接发布到 GitHub 仓库
- 为后续更完整的本地体验打底：
  - 登录状态摘要
  - GitHub / Gmail 状态卡
  - 本地 HTML 面板

## 当前已实现

### 认证层

- GitHub `manual_token`
- Google `browser_oauth`
- Google `manual_refresh_token`
- 本地状态查看、校验、注销
- 业务路由决策：
  - `auth_resolve_route`

### GitHub 业务层

- 仓库信息读取
- 分支列表读取
- PR 列表 / 详情读取
- issue 列表 / 详情读取
- issue 创建 / 评论创建
- PR 创建 / 通用评论创建 / 评论型 review 创建
- 基于仓库链接的发布预览 / 执行：
  - `github_publish_prepare`
  - `github_publish_execute`
  - 支持“工作区有未提交改动时的正常发布”与“已提交但未推送时的恢复发布”

### Google 现状

- 已完成本地 OAuth 与 refresh token 两条认证路径
- 当前仍停留在认证层和状态层
- 本地业务补全尚未开始

### 体验层

- 结构化登录状态摘要：
  - `auth_status_overview`
- GitHub / Gmail 状态卡：
  - `auth_status_cards`
  - `auth_refresh_status_card`
- 本地 HTML 面板：
  - `ui_open_panel`

### 接入层

- 项目内 MCP manifest：
  - `mcp/service-auth-gateway/.mcp.json`
- 可选的全局 MCP 注册：
  - 用户可以在自己的 Codex 配置里注册 `service-auth-gateway`

## 当前未实现与边界

- 本项目不接管官方 `@github` / `@gmail` / `@google-drive` 登录态
- 当前仍未实现显式 `@助手` 全局入口
- GitHub 本地补全当前不覆盖：
  - labels
  - merge
  - approve / request changes
  - release
  - Pages / Actions 等更完整业务 API
- Google 本地补全当前还没有进入 Gmail / Drive / Docs / Sheets / Slides 业务层
- GitHub 发布 v1 当前只支持：
  - 当前已登录个人账号名下仓库
  - 自动创建个人仓库
- GitHub 发布 v1 当前不支持：
  - 组织仓库
  - 非空远端自动合并
  - behind / diverged 后的恢复
  - pull / rebase / force push

## 最短上手

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

6. 准备凭证：
   - GitHub：看 [GitHub 凭证指南](./references/GITHUB_CREDENTIAL_SETUP.md)
   - Google：看 [Google 凭证指南](./references/GOOGLE_CREDENTIAL_SETUP.md)

7. 更完整的公开配置说明：
   - [PUBLIC_SETUP_GUIDE.md](./references/PUBLIC_SETUP_GUIDE.md)

## 文档导航

- [DOCUMENTATION_GUIDE.md](./DOCUMENTATION_GUIDE.md)
  - 全部说明文档导航入口
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
  - 项目主说明、当前边界、后续方向
- [references/PUBLIC_SETUP_GUIDE.md](./references/PUBLIC_SETUP_GUIDE.md)
  - 面向外部用户的公开安装与配置说明
- [references/GITHUB_CREDENTIAL_SETUP.md](./references/GITHUB_CREDENTIAL_SETUP.md)
  - GitHub PAT 获取与配置步骤
- [references/GOOGLE_CREDENTIAL_SETUP.md](./references/GOOGLE_CREDENTIAL_SETUP.md)
  - Google OAuth client 获取与配置步骤
- [references/OPERATION_MANUAL.md](./references/OPERATION_MANUAL.md)
  - 正式操作手册
- [references/MCP_AND_PROJECT_GUIDE.md](./references/MCP_AND_PROJECT_GUIDE.md)
  - 面向新手的原理说明

## 发展路线

### v1 已实现

- 认证层：
  - GitHub / Google 本地认证入口
  - 状态查看、校验、注销
  - 路由决策 `auth_resolve_route`
- 业务层：
  - GitHub 读操作补全
  - GitHub 第一批协作写操作
  - 当前项目发布到 GitHub
- 体验层：
  - 状态摘要
  - 状态卡
  - 本地 HTML 面板
- 全局入口：
  - 项目内 `service-auth-router`
  - 可选的全局 MCP 服务发现

### 下一阶段

- 业务层：
  - GitHub labels / merge / release 等后续写操作
  - Google 业务层缺口补全启动
- 体验层：
  - 面板内更完整的登录、发布与错误恢复交互
- 全局入口：
  - 聊天层显式入口收口为 `@助手`

### 后续阶段

- 认证层：
  - 更稳定的恢复与状态一致性
- 业务层：
  - 更广的 GitHub 业务 API
  - Google 只读业务能力逐步补齐
- 体验层：
  - 更接近官方插件的统一使用体验
- 全局入口：
  - 跨项目复用的统一入口

### 远期探索

- 在不接管官方登录态的前提下，尽量逼近官方插件的顺手程度
- 让 `@助手` 成为更清晰的前台统一入口
