# 项目规则

项目发生代码、配置、脚本、结构、流程或约束变更时，必须同步更新本说明文档。
当前项目采用 Git 主线 + worktree 协作时，worktree 只承载代码和文档，不承载本地登录态或运行态认证文件。

# 项目概况

本项目是一个面向 Codex 本地环境的统一登录原型，目标是在当前 API 路线下，为 `GitHub` 和 `Google` 提供一套可复用的本地认证入口，并用 `skill + MCP` 两层结构统一处理登录状态、登录流程和后续路由决策。

当前项目不尝试接管或复用官方云端 connector 的内部登录态，而是提供本地可控的替代认证层。

## 最终目标

- 长期目标：
  - 形成可持久保存认证信息的本地统一登录与操作底座，重启电脑或重启 Codex 后仍能恢复可用状态
- 体验目标：
  - 在普通聊天、自定义 skill、MCP 工具入口中，实现与官方 Gmail / GitHub 插件接近的等效体验
- GitHub 发布目标：
  - 在完成本地 GitHub 认证后，支持从当前工作区直接面向指定 GitHub 仓库执行发布准备与推送
  - 目标体验是用户只需提供仓库地址或目标仓库信息，系统即可完成仓库校验、git 初始化或绑定、提交与 push
  - 若后续扩展到 GitHub Pages、Actions 或其他平台发布，应明确区分“推送到仓库”和“部署到运行平台”两类能力
- 可视化目标：
  - 第一版实现登录状态可视化
  - 后续再升级为可点击发起登录、查看账号、注销的本地登录面板
- 兼容目标：
  - 官方 `@gmail/@github` 入口只作为远期探索方向，不作为当前阶段承诺

## 环境假设

- 当前用户机器只有 `Chrome`
- Google OAuth 当前优先按“显式调用本机 Chrome，必要时再手动复制到 Chrome”设计

# 当前结论

## 官方插件现状

- 当前 Codex 使用 `API` 路线工作，不具备 ChatGPT 云账号 connector 登录能力。
- 官方 `@gmail`、`@google-drive`、`@github` 插件即使本地已安装，也不等于当前环境下可直接完成登录。
- 本项目的处理策略是：
  - 能明确使用官方 connector 的场景，给出 `use_official_connector`
  - 官方 connector 不可用或不适配当前环境时，转到本地 `service-auth-gateway`

## 本地统一登录原型现状

当前已经完成一版可运行的本地统一登录原型，并且 `service-auth-gateway` 已注册到全局 Codex MCP 配置，覆盖：

- `GitHub`
- `Google`
  - `gmail-basic`
  - `drive-basic`

当前认证能力如下：

- `GitHub`
  - 支持 `manual_token`
  - 通过 GitHub API 校验 token 是否有效
  - 已完成至少一次真实 token 联调并验证可写入本地凭据存储
  - 已修复仅有 secret、缺少 provider state 时 `auth_validate` 无法恢复的问题
  - 已实现 GitHub 发布准备与执行原型：
    - `github_publish_prepare`
    - `github_publish_execute`
  - 当前支持“提供 GitHub 仓库链接后，将当前项目推送到当前已登录个人账号名下仓库”
- `Google`
  - 支持 `browser_oauth`
  - 支持 `manual_refresh_token`
  - 浏览器 OAuth 当前按 `localhost` loopback 回调处理
  - 浏览器 OAuth 当前已补 `PKCE (S256)` 与 `select_account`
  - 项目内联调脚本当前优先显式调用本机 `Chrome`
  - 对 Google token 交换与 refresh，当前已补 Windows PowerShell 网络回退以兼容部分主机上的 Node 连接超时
  - 已完成至少一次真实 `browser_oauth` 联调并验证可写入本地凭据存储
  - 登录状态可视化
    - 支持结构化状态摘要输出
  - 本地可视化面板
    - 已支持 `ui_open_panel`
    - 当前面板可查看登录总览，并提供 GitHub 发布入口

当前接入形态需要区分两层事实：

- 项目内已经提供本地 MCP manifest：
  - `mcp/service-auth-gateway/.mcp.json`
- 当前用户环境中还额外完成了全局 Codex MCP 注册：
  - `C:\Users\86175\.codex\config.toml`
  - `mcp_servers.service-auth-gateway`

这表示该原型既可以作为项目内本地 MCP 原型独立运行，也已经在当前用户机器上被 Codex 从全局配置发现。

## GitHub 发布能力边界

- 当前已实现：
  - GitHub `manual_token` 认证与有效性校验
  - 登录状态查看、校验与本地凭据管理
  - 基于仓库链接的 GitHub 发布准备：
    - 校验当前 GitHub 登录
    - 校验仓库 owner 是否属于当前已登录个人账号
    - 检查目标仓库是否存在、是否为空仓、是否允许自动创建
    - 检查当前项目 git 状态、`origin` 状态与待提交预览
  - 基于仓库链接的 GitHub 发布执行：
    - 仓库不存在时可自动创建个人仓库
    - 非 git 目录可自动 `git init`
    - 首次提交默认使用 `main`
    - 自动绑定干净 HTTPS `origin`
    - 使用用户提供的 commit message 完成 commit 与 push
- 当前未实现：
  - 基于已登录状态直接执行 GitHub 仓库、分支、PR、Pages、Actions 等业务操作
  - 组织仓库创建与发布
  - 非空远端自动合并、pull、rebase、force push
  - 仅凭自然语言在输入框中达到官方 `@github` 等效体验
- 规划中但尚未交付：
  - 增加 GitHub 业务操作 adapter，补仓库信息读取、分支、PR 与发布结果回显
  - 在认证层与发布链路稳定后，把更多 GitHub 业务操作纳入统一工作流
- 远期探索方向：
  - 更接近官方 `@github` 使用体验的一体化发布入口

# 项目结构

项目根目录当前关键内容如下：

- `PROJECT_CONTEXT.md`
  - 项目主说明文档，也是持续维护上下文主入口
- `DOCUMENTATION_GUIDE.md`
  - 项目全部说明文档的导航页
- `README.md`
  - 项目简要入口说明
- `CODEX_TASK_README.md`
  - 本次任务目录约束，不作为项目主说明文档
- `skill/service-auth-router/`
  - 统一登录 skill
- `mcp/service-auth-gateway/`
  - 本地 MCP 认证网关原型
  - 包含项目内 MCP manifest：`.mcp.json`
- `references/MCP_AND_PROJECT_GUIDE.md`
  - 面向新手的 MCP 与项目详细介绍
- `references/provider-matrix.md`
  - provider 与 capability bundle 对照说明
- `references/OPERATION_MANUAL.md`
  - 项目正式操作手册，面向实际使用与后续扩写

## 统一 Skill

`skill/service-auth-router/` 负责：

- 识别用户是在请求登录、查看登录状态、推送发布、切换账号、注销，还是在做任务时缺少认证
- 识别目标服务是 `github` 还是 `google`
- 判断走官方 connector 还是本地 `MCP` 网关
- 对下游给出统一结论：
  - `use_official_connector`
  - `use_local_auth_gateway`
  - `auth_blocked_with_reason`

## 本地 MCP 网关

`mcp/service-auth-gateway/` 当前实现的工具接口包括：

- `auth_list_providers`
- `auth_status`
- `auth_status_overview`
- `auth_begin`
- `auth_complete`
- `auth_validate`
- `auth_logout`
- `auth_capability_matrix`
- `github_publish_prepare`
- `github_publish_execute`
- `ui_open_panel`

支持的 provider 固定为：

- `github`
- `google`

支持的 capability bundle 固定为：

- `github-basic`
- `gmail-basic`
- `drive-basic`

# 运行与验证

本地运行入口：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login\mcp\service-auth-gateway
npm start
```

测试命令：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login\mcp\service-auth-gateway
npm test
```

MCP smoke test：

```powershell
cd D:\project\CodexWorkSpace\2026-04-29-login\mcp\service-auth-gateway
npm run smoke
```

当前已验证通过：

- `npm test`
- `npm run smoke`

## 登录状态可视化

当前“可视化登录”已包含两种形态：

- 结构化状态可视化：
  - `auth_status_overview()`
- 本地 HTML 面板：
  - `ui_open_panel()`

推荐入口：

```text
auth_status_overview()
```

它用于查看：

- provider
- 当前状态
- 当前账号
- 已授权 bundles
- 上次校验时间
- 下一步建议动作

本地 HTML 面板当前支持：

- 查看 GitHub / Google 登录总览
- 手动校验 GitHub 登录
- 注销 GitHub 本地凭据
- 输入仓库链接、commit message 并执行 GitHub 发布预览 / 发布

# 凭据与状态

秘密信息与元数据分离：

- 正常运行时：
  - token、refresh token、client secret 存入 Windows Credential Manager
- 测试模式下：
  - 使用环境变量模拟 secret 存储
- 测试隔离：
  - 自动化测试当前使用独立测试数据目录，不再复用真实 `data/` 目录
- 非敏感状态写入：
  - `mcp/service-auth-gateway/data/state.json`
  - `mcp/service-auth-gateway/data/sessions.json`

状态文件只承担原型调试与流程跟踪用途，不应写入敏感 token 明文。

## 版本控制约束

- `mcp/service-auth-gateway/data/` 下的真实运行态文件默认不进入版本控制
- worktree 间不共享或提交某一台机器上的本地认证状态
- 如需保留结构说明，应使用示例文件或目录说明，而不是提交真实状态文件

# 当前限制

- 本项目当前仍以“项目内原型”为主进行开发和维护，但 `service-auth-gateway` 已接入全局 Codex MCP 配置。
- 本项目当前仍未实现官方 `@gmail/@github` 入口接管。
- 当前已实现 GitHub 最小发布链路，但仍未实现 Gmail、Drive、GitHub 的完整业务操作工具族。
- Google 浏览器 OAuth 已支持本地 loopback 回调，但仍依赖用户提供有效的 OAuth client 信息。
- GitHub 当前只做 `manual_token` 路径，不依赖 `gh auth login`，也未实现 GitHub 浏览器 OAuth。
- 默认每个 provider 只维护一个活动账号，多账号切换未实现。
- 本项目不会把本地认证结果写回官方插件登录态。
- 即使后续接入 Codex 设置中的 MCP 管理，也不等于 Codex 原生会显示“Gmail 已登录 / GitHub 已登录”的平台级登录面板。
- GitHub 发布 v1 当前只支持当前已登录个人账号名下仓库，不支持组织仓库。
- GitHub 发布 v1 当前要求用户显式提供 commit message，并在预览后确认。
- GitHub 发布 v1 当前不处理非空远端自动合并、pull、rebase、force push、子模块或 LFS。

## 全局接入现状

当前已完成的全局接入：

- `service-auth-gateway` 已写入 `C:\Users\86175\.codex\config.toml`
- 项目内同时保留独立 manifest：
  - `mcp/service-auth-gateway/.mcp.json`
- 当前全局 MCP 配置中已存在：
  - `mcp_servers.service-auth-gateway`

这表示：

- Codex 已可从全局配置发现此 MCP 服务
- 这属于 MCP 服务注册，而不是官方 connector 登录态接管
- 项目内 manifest 与当前用户机器上的全局注册可以分别存在
- 不等于官方 Gmail / GitHub 插件已经接管本地登录态

# 后续建议

如果继续推进，优先级建议如下：

1. 先为 GitHub 补齐最小发布链路：仓库校验、git 初始化或绑定、commit、push
2. 在已实现的 GitHub 发布链路基础上，再补对应 provider 的业务操作 adapter
3. 在当前 HTML 面板基础上，再评估是否需要更强的可视化登录面板或更接近 `@` 入口的体验层
